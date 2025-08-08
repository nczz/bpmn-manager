/**
 * BPMN流程圖管理工具
 * 整合bpmn-js的編輯器與擴展功能
 */

$(document).ready(function() {
  /**
   * 全局變量
   */
  let bpmnModeler;
  let currentDiagramId = null;
  
  /**
   * 初始化應用程序
   */
  function initApp() {
    // 檢查登入狀態
    checkLoginStatus();
    
    // 綁定登入表單提交事件
    $('#loginForm').on('submit', handleLogin);
    
    // 綁定登出按鈕事件
    $('#navLogout').on('click', handleLogout);
    
    // 初始化面板控制
    initPanelControls();
    
    // 初始化BPMN工具按鈕
    initToolButtons();
  }
  
  /**
   * ======================
   * 身份驗證相關功能
   * ======================
   */
  
  /**
   * 處理登入表單提交
   */
  function handleLogin(e) {
    e.preventDefault();
    
    const username = $('#username').val();
    const password = $('#password').val();
    const otp = $('#otp').val();
    
    // 清除錯誤訊息
    $('#loginError').addClass('d-none').text('');
    
    // 執行登入
    $.ajax({
      url: 'api.php',
      type: 'POST',
      data: {
        action: 'login',
        username: username,
        password: password,
        otp: otp
      },
      dataType: 'json',
      success: function(response) {
        if (response.success) {
          // 儲存登入狀態
          localStorage.setItem('loggedIn', 'true');
          localStorage.setItem('username', username);
          localStorage.setItem('token', response.token);
          
          // 顯示編輯器頁面
          showEditorPage();
        } else {
          // 顯示錯誤訊息
          $('#loginError').removeClass('d-none').text(response.message);
        }
      },
      error: function() {
        $('#loginError').removeClass('d-none').text('登入時發生錯誤，請稍後再試。');
      }
    });
  }
  
  /**
   * 處理登出
   */
  function handleLogout(e) {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    
    // 呼叫API登出
    $.ajax({
      url: 'api.php',
      type: 'POST',
      data: {
        action: 'logout',
        token: token
      },
      dataType: 'json',
      complete: function() {
        // 無論成功與否，清除登入狀態並導向到登入頁面
        localStorage.removeItem('loggedIn');
        localStorage.removeItem('username');
        localStorage.removeItem('token');
        showLoginPage();
      }
    });
  }
  
  /**
   * 檢查登入狀態
   */
  function checkLoginStatus() {
    const loggedIn = localStorage.getItem('loggedIn');
    const token = localStorage.getItem('token');
    
    if (loggedIn === 'true' && token) {
      // 驗證token是否有效
      $.ajax({
        url: 'api.php',
        type: 'POST',
        data: {
          action: 'verify_token',
          token: token
        },
        dataType: 'json',
        success: function(response) {
          if (response.success) {
            // 如果token有效，顯示編輯器頁面
            showEditorPage();
          } else {
            // 如果token無效，清除登入狀態
            localStorage.removeItem('loggedIn');
            localStorage.removeItem('username');
            localStorage.removeItem('token');
            showLoginPage();
          }
        },
        error: function() {
          // 如果發生錯誤，清除登入狀態
          localStorage.removeItem('loggedIn');
          localStorage.removeItem('username');
          localStorage.removeItem('token');
          showLoginPage();
        }
      });
    } else {
      showLoginPage();
    }
  }
  
  /**
   * 顯示登入頁面
   */
  function showLoginPage() {
    $('#loginPage').show();
    $('#editorPage').hide();
  }
  
  /**
   * 顯示編輯器頁面
   */
  function showEditorPage() {
    $('#loginPage').hide();
    $('#editorPage').css('display', 'flex');
    
    // 顯示當前用戶名
    $('#currentUsername').text(localStorage.getItem('username') || '');
    
    // 如果還沒初始化BPMN編輯器，則初始化
    if (!bpmnModeler) {
      initBpmnModeler();
    }
  }
  
  /**
   * 為每個AJAX請求添加認證token
   */
  $.ajaxSetup({
    beforeSend: function(xhr) {
      const token = localStorage.getItem('token');
      if (token) {
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      }
    }
  });
  
  /**
   * ======================
   * 面板控制相關功能
   * ======================
   */
  
  /**
   * 初始化面板控制
   */
  function initPanelControls() {
    // 面板控制 - 流程圖列表
    $('#btnOpenDiagrams').on('click', function() {
      $('#diagramsPanel').css('display', 'flex');
      loadDiagrams();
    });
    
    $('#closeDiagramsPanel').on('click', function() {
      $('#diagramsPanel').hide();
    });
    
    // 面板控制 - 帳號設定
    $('#navAccount').on('click', function(e) {
      e.preventDefault();
      $('#accountPanel').css('display', 'flex');
      loadAccountInfo();
    });
    
    $('#closeAccountPanel').on('click', function() {
      $('#accountPanel').hide();
    });
    
    // 面板控制 - 普通儲存對話框
    $('#btnSaveDiagram').on('click', async function() {
      // 檢查是否有流程圖可儲存
      try {
        await bpmnModeler.saveXML({ format: true });
        
        // 設置為「儲存」模式
        $('#saveDiagramTitle').text('儲存流程圖');
        $('#saveMode').val('save');
        
        // 打開儲存對話框，確保ID與名稱同步
        const id = currentDiagramId || '';
        $('#diagramId').val(id);
        
        console.log('開啟儲存對話框，當前全局ID:', currentDiagramId);
        console.log('開啟儲存對話框，設置表單ID:', id);
        
        // 預設隱藏操作提示
        $('#saveOperationInfo').hide();
        $('#saveOperationInfoText').text('');
        
        // 如果是已存在的流程圖，顯示當前信息
        if (id) {
          $('#currentDiagramInfo').html(`正在更新現有流程圖 (ID: ${id})`);
          
          // 顯示儲存操作說明
          $('#saveOperationInfo').show();
          $('#saveOperationInfoText').text('儲存操作將更新現有流程圖，不會創建新的記錄');
          
          // 保留原名稱
          if ($('#diagramName').val() === '') {
            const originalName = $('#diagramName').attr('data-original-name') || '';
            $('#diagramName').val(originalName);
            console.log('使用原始名稱:', originalName);
          }
        } else {
          $('#currentDiagramInfo').html('正在創建新流程圖');
          
          // 顯示新創建操作說明
          $('#saveOperationInfo').show();
          $('#saveOperationInfoText').text('此為新流程圖，將創建新的記錄。如果要更新現有流程圖，請先開啟它');
          
          // 新流程圖，只有在流程圖名稱欄位為空時才填充
          if (!$('#diagramName').val()) {
            const defaultName = '新流程圖 ' + new Date().toLocaleString('zh-TW', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
            $('#diagramName').val(defaultName);
            console.log('設置默認名稱:', defaultName);
          }
        }
        
        $('#saveDiagramModal').css('display', 'flex');
      } catch (err) {
        console.error('開啟儲存對話框錯誤:', err);
        showError('儲存流程圖時發生錯誤', err.message);
      }
    });
    
    // 面板控制 - 另存新檔對話框
    $('#btnSaveAsDiagram').on('click', async function() {
      // 檢查是否有流程圖可儲存
      try {
        await bpmnModeler.saveXML({ format: true });
        
        // 設置為「另存新檔」模式
        $('#saveDiagramTitle').text('另存新檔');
        $('#saveMode').val('saveAs');
        
        // 清除ID以創建新流程圖
        $('#diagramId').val('');
        
        console.log('開啟另存新檔對話框');
        
        // 預設隱藏操作提示，但對於另存新檔我們會顯示提示
        $('#saveOperationInfo').show();
        $('#saveOperationInfoText').text('另存新檔將創建一個新的流程圖記錄，而不會更新現有流程圖');
        
        // 預設使用原名稱加上副本字樣
        const originalName = $('#diagramName').attr('data-original-name') || '';
        if (originalName) {
          $('#diagramName').val(originalName + ' - 副本');
        } else {
          // 如果沒有原名稱，生成默認名稱
          const defaultName = '新流程圖 ' + new Date().toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          $('#diagramName').val(defaultName);
        }
        
        $('#currentDiagramInfo').html('將創建為新流程圖');
        $('#saveDiagramModal').css('display', 'flex');
      } catch (err) {
        console.error('開啟另存新檔對話框錯誤:', err);
        showError('另存新檔時發生錯誤', err.message);
      }
    });
    
    $('#closeSaveDiagramModal, #cancelSaveDiagram').on('click', function() {
      $('#saveDiagramModal').hide();
    });
    
    $('#btnSaveDiagramConfirm').on('click', function() {
      saveDiagram().catch(err => {
        console.error('Save diagram error:', err);
      });
    });
    
    // 面板控制 - 匯入對話框
    $('#btnImportDiagram').on('click', function() {
      $('#importDiagramModal').css('display', 'flex');
    });
    
    $('#closeImportDiagramModal, #cancelImportDiagram').on('click', function() {
      $('#importDiagramModal').hide();
    });
    
    // 初始化文件拖放區域
    initFileDropZone();
    
    // 帳號設定表單提交
    $('#accountForm').on('submit', function(e) {
      e.preventDefault();
      updateAccount();
    });
    
    // 2FA啟用狀態變更事件
    $('#enable2FA').on('change', function() {
      if ($(this).is(':checked')) {
        get2FASetup();
      } else {
        $('#otpSetupArea').addClass('d-none');
      }
    });
  }
  
  /**
   * ======================
   * BPMN編輯器相關功能
   * ======================
   */
  
  /**
   * 初始化BPMN編輯器
   */
  function initBpmnModeler() {
    // 建立BPMN編輯器實例
    bpmnModeler = new BpmnJS({
      container: '#bpmnCanvas',
      keyboard: {
        bindTo: window
      }
    });
    
    // 創建新的空白流程圖
    createNewDiagram();
    
    // 監聽建模事件
    bpmnModeler.on('element.changed', function() {
      // 自動暫存功能可以在這裡實現
    });
    
    // 觸發初始化完成事件
    $(document).trigger('bpmnModelerInitialized');
  }
  
  /**
   * 初始化工具按鈕
   */
  function initToolButtons() {
    // 新建流程圖按鈕事件
    $('#btnNewDiagram').on('click', async function() {
      if (confirm('是否確定要新建流程圖？未儲存的修改將會遺失。')) {
        await createNewDiagram();
      }
    });
    
    // 撤銷功能
    $('#btnUndo').on('click', function() {
      executeUndo();
    });
    
    // 重做功能
    $('#btnRedo').on('click', function() {
      executeRedo();
    });
    
    // 放大
    $('#btnZoomIn').on('click', function() {
      executeZoom(0.1);
    });
    
    // 縮小
    $('#btnZoomOut').on('click', function() {
      executeZoom(-0.1);
    });
    
    // 重置縮放
    $('#btnZoomReset').on('click', function() {
      resetZoom();
    });
    
    // 適應視窗
    $('#btnFitViewport').on('click', function() {
      fitViewport();
    });
    
    // 導出功能
    $('#exportSVG').on('click', function(e) {
      e.preventDefault();
      exportDiagram('svg').catch(err => {
        console.error('Export SVG error:', err);
      });
    });
    
    $('#exportPNG').on('click', function(e) {
      e.preventDefault();
      exportDiagram('png').catch(err => {
        console.error('Export PNG error:', err);
      });
    });
    
    $('#exportXML').on('click', function(e) {
      e.preventDefault();
      exportDiagram('xml').catch(err => {
        console.error('Export XML error:', err);
      });
    });
    
    // 添加鍵盤快捷鍵
    $(document).on('keydown', function(e) {
      // Ctrl+Z: 撤銷
      if (e.ctrlKey && e.key === 'z') {
        executeUndo();
        e.preventDefault();
      }
      
      // Ctrl+Y: 重做
      if (e.ctrlKey && e.key === 'y') {
        executeRedo();
        e.preventDefault();
      }
      
      // Ctrl++: 放大
      if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        executeZoom(0.1);
        e.preventDefault();
      }
      
      // Ctrl+-: 縮小
      if (e.ctrlKey && e.key === '-') {
        executeZoom(-0.1);
        e.preventDefault();
      }
      
      // Ctrl+0: 重置縮放
      if (e.ctrlKey && e.key === '0') {
        resetZoom();
        e.preventDefault();
      }
      
      // Ctrl+F: 適應視窗
      if (e.ctrlKey && e.key === 'f') {
        fitViewport();
        e.preventDefault();
      }
      
      // Ctrl+S: 儲存
      if (e.ctrlKey && e.key === 's') {
        $('#btnSaveDiagram').click();
        e.preventDefault();
      }
    });
    
    // 監聽撤銷/重做狀態變化
    $(document).on('bpmnModelerInitialized', function() {
      if (bpmnModeler) {
        const commandStack = bpmnModeler.get('commandStack');
        
        function updateButtons() {
          $('#btnUndo').prop('disabled', !commandStack.canUndo());
          $('#btnRedo').prop('disabled', !commandStack.canRedo());
        }
        
        // 初始更新按鈕狀態
        updateButtons();
        
        // 當命令執行後更新按鈕狀態
        // 新版BPMN.js中使用eventBus監聽命令堆疊事件
        const eventBus = bpmnModeler.get('eventBus');
        eventBus.on('commandStack.changed', function() {
          updateButtons();
        });
      }
    });
  }
  
  /**
   * 創建新的空白流程圖
   */
  async function createNewDiagram() {
    const diagramXML = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
        'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
        'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ' +
        'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ' +
        'id="Definitions_1" ' +
        'targetNamespace="http://bpmn.io/schema/bpmn">' +
        '<bpmn:process id="Process_1" isExecutable="false">' +
        '<bpmn:startEvent id="StartEvent_1"/>' +
        '</bpmn:process>' +
        '<bpmndi:BPMNDiagram id="BPMNDiagram_1">' +
        '<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">' +
        '<bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">' +
        '<dc:Bounds x="412" y="240" width="36" height="36"/>' +
        '</bpmndi:BPMNShape>' +
        '</bpmndi:BPMNPlane>' +
        '</bpmndi:BPMNDiagram>' +
        '</bpmn:definitions>';
    
    console.log('創建新流程圖');
    
    // 清除當前流程圖ID和名稱
    currentDiagramId = null;
    $('#diagramId').val('');
    $('#diagramName').val(''); // 清除儲存對話框中的流程圖名稱
    
    // 導入XML
    try {
      await bpmnModeler.importXML(diagramXML);
      
      // 自動調整視圖
      const canvas = bpmnModeler.get('canvas');
      canvas.zoom('fit-viewport');
      
      // 顯示成功訊息
      showSuccess('已創建新的流程圖');
    } catch (err) {
      console.error('創建新流程圖錯誤:', err);
      showError('建立新流程圖時發生錯誤', err.message);
    }
  }
  
  /**
   * ======================
   * 撤銷/重做與縮放功能
   * ======================
   */
  
  /**
   * 執行撤銷操作
   */
  function executeUndo() {
    try {
      const commandStack = bpmnModeler.get('commandStack');
      
      if (commandStack.canUndo()) {
        commandStack.undo();
      }
    } catch (err) {
      showError('撤銷操作失敗', err.message);
    }
  }
  
  /**
   * 執行重做操作
   */
  function executeRedo() {
    try {
      const commandStack = bpmnModeler.get('commandStack');
      
      if (commandStack.canRedo()) {
        commandStack.redo();
      }
    } catch (err) {
      showError('重做操作失敗', err.message);
    }
  }
  
  /**
   * 執行縮放操作
   * @param {number} delta 縮放增量
   */
  function executeZoom(delta) {
    try {
      const canvas = bpmnModeler.get('canvas');
      const currentZoom = canvas.zoom();
      const newZoom = Math.max(0.2, Math.min(4, currentZoom + delta));
      
      canvas.zoom(newZoom);
    } catch (err) {
      showError('縮放操作失敗', err.message);
    }
  }
  
  /**
   * 重置縮放
   */
  function resetZoom() {
    try {
      const canvas = bpmnModeler.get('canvas');
      canvas.zoom(1.0);
    } catch (err) {
      showError('重置縮放失敗', err.message);
    }
  }
  
  /**
   * 適應視窗
   */
  function fitViewport() {
    try {
      const canvas = bpmnModeler.get('canvas');
      canvas.zoom('fit-viewport');
    } catch (err) {
      showError('適應視窗失敗', err.message);
    }
  }
  
  /**
   * ======================
   * 流程圖存取相關功能
   * ======================
   */
  
  /**
   * 儲存流程圖
   */
  async function saveDiagram() {
    const diagramName = $('#diagramName').val();
    let saveMode = $('#saveMode').val() || 'save'; // 預設為普通儲存模式 // 使用let而非const，因為我們可能需要修改它
    
    // 根據儲存模式確定ID處理方式
    let diagramId = '';
    if (saveMode === 'save') {
      // 普通儲存：使用現有ID
      // 獲取ID，優先使用隱藏字段值，然後使用全局變量
      diagramId = $('#diagramId').val() || currentDiagramId || '';
      
      console.log('儲存前檢查 - 隱藏字段ID值:', $('#diagramId').val());
      console.log('儲存前檢查 - 全局變量ID值:', currentDiagramId);
      console.log('儲存前檢查 - 最終使用的ID值:', diagramId);
      
      // 確保ID是有效的數字
      if (diagramId && diagramId !== '') {
        // 嘗試將ID轉換為數字（如果它不是數字）
        if (typeof diagramId === 'string' && !isNaN(diagramId)) {
          // 保持字符串格式，但確保沒有空格等問題
          diagramId = diagramId.trim();
          console.log('使用現有ID進行儲存 (已清理):', diagramId);
        }
      } else {
        // 如果沒有ID但又是儲存模式，提示用戶用「另存新檔」而不是「儲存」
        console.log('沒有找到有效的ID，將創建新記錄');
        
        // 如果確實沒有ID，則自動切換為另存新檔模式
        saveMode = 'saveAs';
        $('#saveMode').val('saveAs');
        $('#saveDiagramTitle').text('另存新檔'); // 更新標題
        $('#currentDiagramInfo').html('將創建為新流程圖');
        console.log('自動切換為另存新檔模式');
      }
      
      // 加入更詳細的日誌
      console.log('全部表單數據:', {
        action: 'save_diagram',
        id: diagramId,
        name: diagramName,
        save_mode: saveMode
      });
    } else if (saveMode === 'saveAs') {
      // 另存新檔：強制清空ID以創建新記錄
      diagramId = '';
      console.log('另存新檔模式，清空ID');
    }
    
    // 記錄保存前狀態
    const isNewDiagram = !diagramId || saveMode === 'saveAs';
    console.log('保存流程圖 - 模式:', saveMode);
    console.log('保存流程圖 - 當前狀態:', isNewDiagram ? '新建流程圖' : '更新現有流程圖');
    console.log('保存流程圖，ID:', diagramId, '名稱:', diagramName);
    
    if (!diagramName) {
      showWarning('請輸入流程圖名稱');
      return;
    }
    
    try {
      // 獲取流程圖XML
      const result = await bpmnModeler.saveXML({ format: true });
      const xml = result.xml;
      
      try {
        // 記錄送往後端的數據
        console.log('準備送往後端的數據:', {
          action: 'save_diagram',
          id: diagramId,
          name: diagramName,
          save_mode: saveMode,
          id_type: typeof diagramId
        });
        
        // 呼叫API儲存流程圖
        const response = await $.ajax({
          url: 'api.php',
          type: 'POST',
          data: {
            action: 'save_diagram',
            id: diagramId, // 如果是空字串，後端會處理為創建新圖
            name: diagramName,
            xml: xml,
            save_mode: saveMode // 傳送儲存模式到後端
          },
          dataType: 'json'
        });
        
        console.log('後端回應:', response);
        
        if (response.success) {
          // 更新當前流程圖ID和名稱
          currentDiagramId = response.id;
          $('#diagramId').val(currentDiagramId);
          $('#diagramName').attr('data-original-name', diagramName);
          
          // 關閉對話框
          $('#saveDiagramModal').hide();
          
          // 顯示成功訊息
          if (saveMode === 'saveAs') {
            showSuccess('流程圖「' + diagramName + '」已另存為新檔，ID：' + currentDiagramId);
          } else if (isNewDiagram) {
            showSuccess('流程圖「' + diagramName + '」已成功創建，ID：' + currentDiagramId);
          } else {
            showSuccess('流程圖「' + diagramName + '」已成功更新');
          }
          
          console.log('儲存成功，當前流程圖ID:', currentDiagramId);
        } else {
          // 儲存失敗處理
          console.error('儲存失敗:', response.message);
          
          // 如果是找不到ID的錯誤，建議用戶使用「另存新檔」
          if (response.message && response.message.includes('找不到ID')) {
            // 顯示包含下一步建議的錯誤訊息
            showError(response.message + '\n\n提示：您可以使用「另存新檔」功能將其儲存為新檔案');
            
            // 自動切換為另存新檔模式，為下次儲存作準備
            $('#saveMode').val('saveAs');
            $('#saveDiagramTitle').text('另存新檔');
            $('#currentDiagramInfo').html('將創建為新流程圖');
            
            // 在對話框中也更新提示信息
            $('#saveOperationInfo').show();
            $('#saveOperationInfoText').html('<strong>注意：</strong> 由於原流程圖不存在或無法識別，我們已切換為另存新檔模式，將創建新的流程圖記錄');
            
            // 將“另存新檔”按鈕高亮提示用戶
            $('#btnSaveAsDiagram').addClass('btn-highlight');
            setTimeout(() => {
              $('#btnSaveAsDiagram').removeClass('btn-highlight');
            }, 2000);
          } else {
            showError(response.message || '儲存流程圖時發生錯誤');
          }
        }
      } catch (ajaxErr) {
        console.error('AJAX Error:', ajaxErr);
        showError('儲存流程圖時發生錯誤，請稍後再試');
      }
    } catch (err) {
      console.error('保存XML錯誤:', err);
      showError('儲存流程圖時發生錯誤', err.message);
    }
  }
  
  /**
   * 載入流程圖列表
   */
  function loadDiagrams() {
    console.log('載入流程圖列表...');
    $.ajax({
      url: 'api.php',
      type: 'GET',
      data: {
        action: 'list_diagrams'
      },
      dataType: 'json',
      success: function(response) {
        console.log('流程圖列表響應:', response);
        if (response.success && response.diagrams) {
          renderDiagramsList(response.diagrams);
        } else {
          $('#diagramsList').html('<tr><td colspan="3" class="text-center">無法獲取流程圖列表</td></tr>');
          showError(response.message || '載入流程圖列表失敗');
        }
      },
      error: function(xhr, status, error) {
        console.error('AJAX Error:', status, error);
        console.error('Response:', xhr.responseText);
        $('#diagramsList').html('<tr><td colspan="3" class="text-center">載入流程圖列表時發生錯誤</td></tr>');
        showError('載入流程圖列表時發生錯誤，請稍後再試');
      }
    });
  }
  
  /**
   * 渲染流程圖列表
   * @param {Array} diagrams 流程圖數據
   */
  function renderDiagramsList(diagrams) {
    if (!diagrams || diagrams.length === 0) {
      $('#diagramsList').html('<tr><td colspan="3" class="text-center">尚無儲存的流程圖</td></tr>');
      return;
    }
    
    let html = '';
    
    diagrams.forEach(function(diagram) {
      const updatedAt = new Date(diagram.updated_at).toLocaleString();
      
      html += '<tr>';
      html += '<td>' + diagram.name + '</td>';
      html += '<td>' + updatedAt + '</td>';
      html += '<td>';
      html += '<button class="btn btn-sm btn-primary me-1 btn-edit-name" data-id="' + diagram.id + '" data-name="' + diagram.name + '" title="重命名"><i class="bi bi-pencil"></i></button>';
      html += '<button class="btn btn-sm btn-success me-1 btn-load" data-id="' + diagram.id + '" title="載入"><i class="bi bi-box-arrow-in-down"></i></button>';
      html += '<button class="btn btn-sm btn-danger btn-delete" data-id="' + diagram.id + '" title="刪除"><i class="bi bi-trash"></i></button>';
      html += '</td>';
      html += '</tr>';
    });
    
    $('#diagramsList').html(html);
    
    // 綁定按鈕事件
    bindDiagramButtons();
  }
  
  /**
   * 綁定流程圖列表中的按鈕事件
   */
  function bindDiagramButtons() {
    // 載入按鈕
    $('.btn-load').on('click', function() {
      const diagramId = $(this).data('id');
      loadDiagram(diagramId);
    });
    
    // 重命名按鈕
    $('.btn-edit-name').on('click', function() {
      const diagramId = $(this).data('id');
      const currentName = $(this).data('name');
      
      const newName = prompt('請輸入新的流程圖名稱:', currentName);
      
      if (newName && newName !== currentName) {
        renameDiagram(diagramId, newName);
      }
    });
    
    // 刪除按鈕
    $('.btn-delete').on('click', function() {
      const diagramId = $(this).data('id');
      
      if (confirm('是否確定要刪除此流程圖？此操作無法復原。')) {
        deleteDiagram(diagramId);
      }
    });
  }
  
  /**
   * 載入流程圖
   * @param {string} id 流程圖ID
   */
  async function loadDiagram(id) {
    console.log('載入流程圖，ID:', id);
    try {
      const response = await $.ajax({
        url: 'api.php',
        type: 'GET',
        data: {
          action: 'get_diagram',
          id: id
        },
        dataType: 'json'
      });
      
      console.log('流程圖響應:', response);
      
      if (response.success && response.diagram) {
        // 更新當前流程圖資訊
        currentDiagramId = response.diagram.id;
        const currentDiagramName = response.diagram.name;
        
        console.log('載入流程圖成功，設置全局ID:', currentDiagramId, '類型:', typeof currentDiagramId);
        
        // 確保ID是數字格式，而不是字符串
        if (typeof currentDiagramId === 'string') {
          currentDiagramId = parseInt(currentDiagramId, 10);
          console.log('轉換ID為數值:', currentDiagramId);
        }
        
        // 將圖表資訊存儲到隱藏字段，用於儲存功能
        $('#diagramId').val(currentDiagramId);
        console.log('將ID設置到隱藏字段:', $('#diagramId').val());
        
        // 同時更新儲存對話框中的圖表名稱並記住原始名稱
        $('#diagramName').val(currentDiagramName);
        $('#diagramName').attr('data-original-name', currentDiagramName);
        
        try {
          // 導入XML
          await bpmnModeler.importXML(response.diagram.xml);
          
          // 自動調整視圖
          const canvas = bpmnModeler.get('canvas');
          canvas.zoom('fit-viewport');
          
          // 關閉流程圖面板
          $('#diagramsPanel').hide();
          
          // 顯示成功訊息
          showSuccess('流程圖「' + currentDiagramName + '」已成功載入');
          
          console.log('載入完成，當前流程圖ID:', currentDiagramId, '名稱:', currentDiagramName);
        } catch (err) {
          console.error('XML導入錯誤:', err);
          showError('載入流程圖時發生錯誤', err.message);
        }
      } else {
        showError(response.message || '載入流程圖時發生錯誤');
      }
    } catch (ajaxErr) {
      console.error('AJAX錯誤:', ajaxErr);
      showError('載入流程圖時發生錯誤，請稍後再試');
    }
  }
  
  /**
   * 重命名流程圖
   * @param {string} id 流程圖ID
   * @param {string} newName 新名稱
   */
  function renameDiagram(id, newName) {
    $.ajax({
      url: 'api.php',
      type: 'POST',
      data: {
        action: 'rename_diagram',
        id: id,
        name: newName
      },
      dataType: 'json',
      success: function(response) {
        if (response.success) {
          // 重新載入流程圖列表
          loadDiagrams();
          showSuccess('流程圖已成功重命名');
        } else {
          showError(response.message || '重命名流程圖時發生錯誤');
        }
      },
      error: function() {
        showError('重命名流程圖時發生錯誤，請稍後再試');
      }
    });
  }
  
  /**
   * 刪除流程圖
   * @param {string} id 流程圖ID
   */
  function deleteDiagram(id) {
    $.ajax({
      url: 'api.php',
      type: 'POST',
      data: {
        action: 'delete_diagram',
        id: id
      },
      dataType: 'json',
      success: function(response) {
        if (response.success) {
          // 重新載入流程圖列表
          loadDiagrams();
          showSuccess('流程圖已成功刪除');
        } else {
          showError(response.message || '刪除流程圖時發生錯誤');
        }
      },
      error: function() {
        showError('刪除流程圖時發生錯誤，請稍後再試');
      }
    });
  }
  
  /**
   * ======================
   * 帳號設定相關功能
   * ======================
   */
  
  /**
   * 載入帳號資訊
   */
  function loadAccountInfo() {
    $.ajax({
      url: 'api.php',
      type: 'GET',
      data: {
        action: 'get_account_info'
      },
      dataType: 'json',
      success: function(response) {
        if (response.success && response.user) {
          // 顯示當前帳號
          $('#newUsername').attr('placeholder', response.user.username);
          
          // 顯示2FA狀態
          if (response.user.two_fa_enabled) {
            $('#enable2FA').prop('checked', true);
          } else {
            $('#enable2FA').prop('checked', false);
          }
        } else {
          showError(response.message || '載入帳號資訊時發生錯誤');
        }
      },
      error: function() {
        showError('載入帳號資訊時發生錯誤，請稍後再試');
      }
    });
  }
  
  /**
   * 更新帳號設定
   */
  function updateAccount() {
    // 獲取表單數據
    const currentPassword = $('#currentPassword').val();
    const newUsername = $('#newUsername').val();
    const newPassword = $('#newPassword').val();
    const confirmPassword = $('#confirmPassword').val();
    const enable2FA = $('#enable2FA').is(':checked');
    const otpVerify = $('#otpVerify').val();
    
    // 驗證當前密碼
    if (!currentPassword) {
      showError('請輸入當前密碼以驗證身份');
      return;
    }
    
    // 驗證密碼
    if (newPassword && newPassword !== confirmPassword) {
      showError('新密碼與確認密碼不一致');
      return;
    }
    
    // 驗證2FA
    if (enable2FA && !otpVerify) {
      showError('請輸入OTP驗證碼以確認2FA設定');
      return;
    }
    
    // 清除訊息
    $('#accountSuccess, #accountError').addClass('d-none').text('');
    
    console.log('提交帳號更新請求，需要驗證當前密碼');
    
    // 更新帳號設定
    $.ajax({
      url: 'api.php',
      type: 'POST',
      data: {
        action: 'update_account',
        current_password: currentPassword,
        username: newUsername,
        password: newPassword,
        enable2FA: enable2FA ? 1 : 0,
        otpVerify: otpVerify
      },
      dataType: 'json',
      success: function(response) {
        if (response.success) {
          // 顯示成功訊息
          $('#accountSuccess').removeClass('d-none').text(response.message || '帳號設定已成功更新');
          
          // 如果更新了帳號，更新localStorage中的username
          if (newUsername) {
            localStorage.setItem('username', newUsername);
            $('#currentUsername').text(newUsername);
          }
          
          // 清空表單
          $('#newPassword, #confirmPassword, #otpVerify').val('');
          
          // 如果啟用了2FA，隱藏設定區域
          if (enable2FA) {
            $('#otpSetupArea').addClass('d-none');
          }
          
          showSuccess('帳號設定已成功更新');
        } else {
          $('#accountError').removeClass('d-none').text(response.message || '更新帳號設定時發生錯誤');
          showError(response.message || '更新帳號設定時發生錯誤');
        }
      },
      error: function() {
        $('#accountError').removeClass('d-none').text('更新帳號設定時發生錯誤，請稍後再試');
        showError('更新帳號設定時發生錯誤，請稍後再試');
      }
    });
  }
  
  /**
   * 獲取2FA設定資訊
   */
  function get2FASetup() {
    $.ajax({
      url: 'api.php',
      type: 'GET',
      data: {
        action: 'get_2fa_setup'
      },
      dataType: 'json',
      success: function(response) {
        if (response.success && response.qrCodeUrl) {
          // 顯示QR Code
          $('#qrCodeContainer').html('<img src="' + response.qrCodeUrl + '" alt="2FA QR Code" class="img-fluid">');
          $('#otpSetupArea').removeClass('d-none');
        } else {
          showError(response.message || '獲取2FA設定資訊時發生錯誤');
          $('#enable2FA').prop('checked', false);
        }
      },
      error: function() {
        showError('獲取2FA設定資訊時發生錯誤，請稍後再試');
        $('#enable2FA').prop('checked', false);
      }
    });
  }
  
  /**
   * ======================
   * 導出和導入功能
   * ======================
   */
  
  /**
   * 導出流程圖
   * @param {string} type 導出類型：'svg', 'png', 'xml'
   * @returns {Promise<void>}
   */
  async function exportDiagram(type) {
    // 檢查是否有流程圖
    if (!bpmnModeler) {
      showError('無法導出流程圖，請先創建或載入流程圖');
      return;
    }
    
    let fileName = 'diagram';
    
    // 如果有當前流程圖名稱，則使用該名稱
    if ($('#diagramName').val()) {
      fileName = $('#diagramName').val();
    }
    
    switch (type) {
      case 'svg':
        await exportSVG(fileName);
        break;
      case 'png':
        await exportPNG(fileName);
        break;
      case 'xml':
        await exportXML(fileName);
        break;
      default:
        showError('不支持的導出類型');
    }
  }
  
  /**
   * 導出為SVG
   * @param {string} fileName 文件名
   */
  async function exportSVG(fileName) {
    try {
      const result = await bpmnModeler.saveSVG({ format: true });
      
      // 創建下載連結
      downloadFile(fileName + '.svg', 'image/svg+xml', result.svg);
      showSuccess('成功導出SVG文件');
    } catch (err) {
      showError('導出SVG時發生錯誤', err.message);
    }
  }
  
  /**
   * 導出為PNG
   * @param {string} fileName 文件名
   */
  async function exportPNG(fileName) {
    try {
      const result = await bpmnModeler.saveSVG({ format: true });
      const svg = result.svg;
      
      // 將SVG轉換為PNG
      try {
        const pngData = await svgToPng(svg);
        
        // 下載PNG
        downloadDataURL(fileName + '.png', pngData);
        showSuccess('成功導出PNG文件');
      } catch (convErr) {
        showError('無法轉換為PNG', convErr.message);
      }
    } catch (err) {
      showError('導出PNG時發生錯誤', err.message);
    }
  }
  
  /**
   * 將SVG轉換為PNG
   * @param {string} svg SVG內容
   * @returns {Promise<string>} PNG數據URL
   */
  function svgToPng(svg) {
    return new Promise((resolve, reject) => {
      // 創建畫布和上下文
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // 創建圖片元素
      const image = new Image();
      
      // SVG數據URL
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      // 圖片載入完成後的處理
      image.onload = function() {
        // 設置畫布尺寸
        canvas.width = image.width;
        canvas.height = image.height;
        
        // 在畫布上繪製圖像
        ctx.drawImage(image, 0, 0);
        
        // 釋放URL對象
        URL.revokeObjectURL(url);
        
        // 將畫布轉換為PNG
        try {
          const pngData = canvas.toDataURL('image/png');
          resolve(pngData);
        } catch (e) {
          reject(new Error('無法生成PNG: ' + e.message));
        }
      };
      
      // 圖片載入失敗時的處理
      image.onerror = function() {
        URL.revokeObjectURL(url);
        reject(new Error('載入SVG圖像失敗'));
      };
      
      // 設置圖片源
      image.src = url;
    });
  }
  
  /**
   * 導出為XML
   * @param {string} fileName 文件名
   */
  async function exportXML(fileName) {
    try {
      const result = await bpmnModeler.saveXML({ format: true });
      
      // 創建下載連結
      downloadFile(fileName + '.bpmn', 'application/xml', result.xml);
      showSuccess('成功導出BPMN XML文件');
    } catch (err) {
      showError('導出XML時發生錯誤', err.message);
    }
  }
  
  /**
   * 初始化文件拖放區域
   */
  function initFileDropZone() {
    const dropZone = document.getElementById('fileDropZone');
    const fileInput = document.getElementById('fileInput');
    
    // 點擊上傳
    dropZone.addEventListener('click', function() {
      fileInput.click();
    });
    
    // 文件選擇變更
    fileInput.addEventListener('change', function() {
      if (fileInput.files.length > 0) {
        handleFileUpload(fileInput.files[0]).catch(err => {
          console.error('File upload error:', err);
        });
      }
    });
    
    // 拖動進入
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('active');
    });
    
    // 拖動離開
    dropZone.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('active');
    });
    
    // 拖放文件
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('active');
      
      if (e.dataTransfer.files.length) {
        handleFileUpload(e.dataTransfer.files[0]).catch(err => {
          console.error('File upload error:', err);
        });
      }
    });
  }
  
  /**
   * 處理文件上傳
   * @param {File} file 上傳的文件
   */
  async function handleFileUpload(file) {
    // 檢查文件類型
    if (!file.name.endsWith('.bpmn') && !file.name.endsWith('.xml')) {
      showError('請上傳BPMN文件（.bpmn或.xml）');
      return;
    }
    
    console.log('開始上傳文件:', file.name);
    
    try {
      const xml = await readFileAsText(file);
      
      // 導入XML
      try {
        await bpmnModeler.importXML(xml);
        
        // 自動調整視圖
        const canvas = bpmnModeler.get('canvas');
        canvas.zoom('fit-viewport');
        
        // 關閉匯入對話框
        $('#importDiagramModal').hide();
        
        // 顯示成功訊息
        showSuccess('成功導入流程圖');
        
        // 清除當前流程圖ID
        currentDiagramId = null;
        $('#diagramId').val('');
        
        // 預設設置流程圖名稱為文件名（不包括擴展名）
        const fileName = file.name.replace(/\.(bpmn|xml)$/i, '');
        $('#diagramName').val(fileName);
        
        console.log('文件已導入，重置ID，設置名稱為:', fileName);
      } catch (err) {
        console.error('導入XML錯誤:', err);
        showError('導入流程圖時發生錯誤', err.message);
      }
    } catch (readErr) {
      console.error('讀取文件錯誤:', readErr);
      showError('讀取文件時發生錯誤');
    }
  }
  
  /**
   * 讀取文件作為文本
   * @param {File} file 要讀取的文件
   * @returns {Promise<string>} 文件內容
   */
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = function(e) {
        resolve(e.target.result);
      };
      
      reader.onerror = function() {
        reject(new Error('讀取文件失敗'));
      };
      
      reader.readAsText(file);
    });
  }
  
  /**
   * 下載文件
   * @param {string} fileName 文件名
   * @param {string} mimeType MIME類型
   * @param {string} content 文件內容
   */
  function downloadFile(fileName, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    
    // 釋放URL對象
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }
  
  /**
   * 下載數據URL
   * @param {string} fileName 文件名
   * @param {string} dataURL 數據URL
   */
  function downloadDataURL(fileName, dataURL) {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = fileName;
    link.click();
  }
  
  /**
   * ======================
   * 通知系統
   * ======================
   */
  
  /**
   * 顯示通知
   * @param {string} type 通知類型：'success', 'error', 'warning', 'info'
   * @param {string} title 通知標題
   * @param {string} message 通知訊息
   * @param {number} duration 顯示時間（毫秒）
   * @returns {string} 通知ID
   */
  function showNotification(type, title, message, duration = 5000) {
    const notificationId = 'notification-' + Date.now();
    let iconClass = '';
    
    // 根據類型設置圖標
    switch(type) {
      case 'success':
        iconClass = 'bi-check-circle-fill text-success';
        break;
      case 'error':
        iconClass = 'bi-x-circle-fill text-danger';
        break;
      case 'warning':
        iconClass = 'bi-exclamation-triangle-fill text-warning';
        break;
      case 'info':
      default:
        iconClass = 'bi-info-circle-fill text-info';
        break;
    }
    
    // 創建通知HTML
    const notificationHtml = `
      <div id="${notificationId}" class="notification notification-${type}">
        <div class="notification-icon">
          <i class="bi ${iconClass}"></i>
        </div>
        <div class="notification-content">
          <div class="notification-title">${title}</div>
          <div class="notification-message">${message}</div>
        </div>
        <div class="notification-close" onclick="closeNotification('${notificationId}')">
          <i class="bi bi-x"></i>
        </div>
      </div>
    `;
    
    // 添加通知到容器
    $('#notificationSystem').append(notificationHtml);
    
    // 設置自動關閉
    if (duration > 0) {
      setTimeout(() => {
        closeNotification(notificationId);
      }, duration);
    }
    
    return notificationId;
  }
  
  /**
   * 關閉通知
   * @param {string} notificationId 通知ID
   */
  function closeNotification(notificationId) {
    const $notification = $('#' + notificationId);
    
    // 添加退出動畫
    $notification.css({
      'transform': 'translateX(100%)',
      'opacity': '0',
      'transition': 'all 0.3s ease-out'
    });
    
    // 動畫完成後移除元素
    setTimeout(() => {
      $notification.remove();
    }, 300);
  }
  
  /**
   * 顯示成功通知
   * @param {string} message 訊息
   * @param {string} title 標題，默認為"成功"
   */
  function showSuccess(message, title = '成功') {
    return showNotification('success', title, message);
  }
  
  /**
   * 顯示錯誤通知
   * @param {string} message 訊息
   * @param {string} details 詳情
   * @param {string} title 標題，默認為"錯誤"
   */
  function showError(message, details = '', title = '錯誤') {
    const displayMessage = details ? `${message}：${details}` : message;
    return showNotification('error', title, displayMessage);
  }
  
  /**
   * 顯示警告通知
   * @param {string} message 訊息
   * @param {string} title 標題，默認為"警告"
   */
  function showWarning(message, title = '警告') {
    return showNotification('warning', title, message);
  }
  
  /**
   * 顯示信息通知
   * @param {string} message 訊息
   * @param {string} title 標題，默認為"信息"
   */
  function showInfo(message, title = '信息') {
    return showNotification('info', title, message);
  }
  
  // 暴露通知函數給全局
  window.closeNotification = closeNotification;
  
  // 初始化應用程序
  initApp();
});