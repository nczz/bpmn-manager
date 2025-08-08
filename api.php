<?php
/**
 * BPMN流程圖管理工具 API
 * 處理所有後端請求，包括身份驗證、資料儲存和讀取
 */

// 設置響應類型為JSON
header("Content-Type: application/json");

// 允許跨域請求
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// 如果是OPTIONS請求，則直接返回200
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
	http_response_code(200);
	exit;
}

function mxp_save_error_log($message) {
	// 設定時區
	date_default_timezone_set('Asia/Taipei');

	// 格式化時間戳
	$timestamp = date('Y-m-d H:i:s');

	// 準備要寫入的內容
	$logEntry = "[{$timestamp}] {$message}" . PHP_EOL;

	// 使用 getcwd() 確保是啟動伺服器的工作目錄
	$logFile = getcwd() . '/debug.log';

	// 寫入檔案
	file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);

	// 同時輸出到終端機（不影響 HTTP 輸出）
	file_put_contents('php://stderr', $logEntry);
}

// 設置資料庫目錄
$DB_DIR = __DIR__ . '/database';

// 確保資料庫目錄存在
if (!file_exists($DB_DIR)) {
	mkdir($DB_DIR, 0755, true);
}

// 獲取請求方法
$method = $_SERVER['REQUEST_METHOD'];

// 獲取請求的動作
$action = isset($_POST['action']) ? $_POST['action'] : (isset($_GET['action']) ? $_GET['action'] : '');

// 根據請求方法和動作執行相應的處理
if ($method === 'GET') {
	switch ($action) {
	case 'list_diagrams':
		handleListDiagrams();
		break;
	case 'get_diagram':
		handleGetDiagram();
		break;
	case 'get_account_info':
		handleGetAccountInfo();
		break;
	case 'get_2fa_setup':
		handleGet2FASetup();
		break;
	default:
		echo json_encode(array("success" => false, "message" => "未知的GET動作"));
		break;
	}
} else if ($method === 'POST') {
	switch ($action) {
	case 'login':
		handleLogin();
		break;
	case 'logout':
		handleLogout();
		break;
	case 'verify_token':
		handleVerifyToken();
		break;
	case 'update_account':
		handleUpdateAccount();
		break;
	case 'save_diagram':
		handleSaveDiagram();
		break;
	case 'rename_diagram':
		handleRenameDiagram();
		break;
	case 'delete_diagram':
		handleDeleteDiagram();
		break;
	default:
		echo json_encode(array("success" => false, "message" => "未知的POST動作"));
		break;
	}
} else {
	echo json_encode(array("success" => false, "message" => "不支持的請求方法"));
}

/**
 * 取得資料庫連接
 * @return PDO 資料庫連接
 */
function getDBConnection() {
	global $DB_DIR;

	// 尋找資料庫文件
	$dbFile = findDatabaseFile($DB_DIR);

	// 如果找不到資料庫文件，則創建一個新的
	if (!$dbFile) {
		$dbFile = createNewDatabaseFile($DB_DIR);
	}

	// 創建PDO實例
	try {
		$pdo = new PDO("sqlite:" . $dbFile);
		$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
		return $pdo;
	} catch (PDOException $e) {
		mxp_save_error_log("Database Connection Error: " . $e->getMessage());
		return null;
	}
}

/**
 * 尋找資料庫文件
 * @param string $dir 資料庫目錄
 * @return string|null 資料庫文件路徑或null
 */
function findDatabaseFile($dir) {
	// 掃描目錄中的所有文件
	$files = scandir($dir);

	foreach ($files as $file) {
		// 跳過當前目錄和父目錄
		if ($file === '.' || $file === '..') {
			continue;
		}

		// 檢查文件是否為SQLite資料庫
		$filePath = $dir . '/' . $file;
		if (is_file($filePath) && pathinfo($filePath, PATHINFO_EXTENSION) === 'sqlite') {
			return $filePath;
		}
	}

	return null;
}

/**
 * 創建新的資料庫文件
 * @param string $dir 資料庫目錄
 * @return string 新創建的資料庫文件路徑
 */
function createNewDatabaseFile($dir) {
	// 生成一個隨機的文件名
	$randomString = bin2hex(random_bytes(16));
	$dbFile = $dir . '/' . $randomString . '.sqlite';

	// 創建資料庫連接
	$pdo = new PDO("sqlite:" . $dbFile);
	$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

	// 創建用戶表
	$pdo->exec("CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        two_fa_secret TEXT,
        two_fa_enabled INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

	// 創建流程圖表
	$pdo->exec("CREATE TABLE diagrams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        xml TEXT NOT NULL,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )");

	// 創建會話表
	$pdo->exec("CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        user_id INTEGER,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )");

	// 創建默認管理員帳號
	$default_password = password_hash('admin', PASSWORD_DEFAULT);
	$pdo->exec("INSERT INTO users (username, password) VALUES ('admin', '$default_password')");

	return $dbFile;
}

/**
 * 從請求頭獲取Bearer Token
 * @return string|null token或null
 */
function getBearerToken() {
	$headers = getallheaders();

	if (isset($headers['Authorization'])) {
		if (preg_match('/Bearer\s(\S+)/', $headers['Authorization'], $matches)) {
			return $matches[1];
		}
	}

	return null;
}

/**
 * 驗證用戶身份
 * @return int|false 用戶ID或false
 */
function validateAuth() {
	// 獲取token
	$token = getBearerToken();

	if (!$token && isset($_POST['token'])) {
		$token = $_POST['token'];
	}

	if (!$token) {
		mxp_save_error_log("Auth Failed: No token provided");
		return false;
	}

	// 截斷token以便在日誌中顯示（僅顯示前10個字符）
	$logToken = substr($token, 0, 10) . '...';
	mxp_save_error_log("Auth Attempt with token: $logToken");

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		mxp_save_error_log("Auth Failed: Database connection failed");
		return false;
	}

	try {
		// 查詢會話
		$stmt = $pdo->prepare("SELECT * FROM sessions WHERE token = :token");
		$stmt->bindParam(':token', $token);
		$stmt->execute();

		$session = $stmt->fetch(PDO::FETCH_ASSOC);

		// 如果找不到會話，則返回false
		if (!$session) {
			mxp_save_error_log("Auth Failed: Session not found for token: $logToken");
			return false;
		}

		// 檢查會話是否過期
		$current_time = date('Y-m-d H:i:s');
		if ($session['expires_at'] < $current_time) {
			mxp_save_error_log("Auth Failed: Session expired for user_id: " . $session['user_id']);
			return false;
		}

		mxp_save_error_log("Auth Success: User ID " . $session['user_id'] . " authenticated");
		return $session['user_id'];
	} catch (PDOException $e) {
		mxp_save_error_log("Auth Failed: Database error: " . $e->getMessage());
		return false;
	}
}

/**
 * ======================
 * 身份驗證相關處理函數
 * ======================
 */

/**
 * 處理登入請求
 */
function handleLogin() {
	// 檢查請求參數
	if (!isset($_POST['username']) || !isset($_POST['password'])) {
		echo json_encode(array("success" => false, "message" => "缺少必要參數"));
		return;
	}

	$username = $_POST['username'];
	$password = $_POST['password'];
	$otp = isset($_POST['otp']) ? $_POST['otp'] : '';

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 查詢用戶
	$stmt = $pdo->prepare("SELECT * FROM users WHERE username = :username");
	$stmt->bindParam(':username', $username);
	$stmt->execute();

	$user = $stmt->fetch(PDO::FETCH_ASSOC);

	// 如果找不到用戶，則返回錯誤
	if (!$user) {
		echo json_encode(array("success" => false, "message" => "用戶名或密碼錯誤"));
		return;
	}

	// 驗證密碼
	if (!password_verify($password, $user['password'])) {
		echo json_encode(array("success" => false, "message" => "用戶名或密碼錯誤"));
		return;
	}

	// 驗證2FA（如果啟用）
	if ($user['two_fa_enabled']) {
		// 如果沒有提供OTP
		if (empty($otp)) {
			echo json_encode(array("success" => false, "message" => "請輸入2FA驗證碼"));
			return;
		}

		// 模擬2FA驗證（實際應用中請使用真實的2FA庫）
		if ($otp !== '123456') { // 這只是示例，實際應用中不要使用固定驗證碼
			echo json_encode(array("success" => false, "message" => "2FA驗證碼錯誤"));
			return;
		}
	}

	// 創建會話
	$token = bin2hex(random_bytes(32));
	$expires_at = date('Y-m-d H:i:s', strtotime('+24 hours'));

	$stmt = $pdo->prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (:token, :user_id, :expires_at)");
	$stmt->bindParam(':token', $token);
	$stmt->bindParam(':user_id', $user['id']);
	$stmt->bindParam(':expires_at', $expires_at);

	if (!$stmt->execute()) {
		echo json_encode(array("success" => false, "message" => "創建會話失敗"));
		return;
	}

	// 返回成功資訊和token
	echo json_encode(array(
		"success" => true,
		"message" => "登入成功",
		"token" => $token,
		"username" => $user['username'],
	));
}

/**
 * 處理登出請求
 */
function handleLogout() {
	// 獲取token
	$token = getBearerToken();

	if (!$token && isset($_POST['token'])) {
		$token = $_POST['token'];
	}

	if (!$token) {
		echo json_encode(array("success" => false, "message" => "未提供token"));
		return;
	}

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 刪除會話
	$stmt = $pdo->prepare("DELETE FROM sessions WHERE token = :token");
	$stmt->bindParam(':token', $token);

	if (!$stmt->execute()) {
		echo json_encode(array("success" => false, "message" => "登出失敗"));
		return;
	}

	// 返回成功資訊
	echo json_encode(array("success" => true, "message" => "登出成功"));
}

/**
 * 處理驗證token請求
 */
function handleVerifyToken() {
	// 獲取token
	$token = getBearerToken();

	if (!$token && isset($_POST['token'])) {
		$token = $_POST['token'];
	}

	if (!$token) {
		echo json_encode(array("success" => false, "message" => "未提供token"));
		return;
	}

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 查詢會話
	$stmt = $pdo->prepare("SELECT * FROM sessions WHERE token = :token");
	$stmt->bindParam(':token', $token);
	$stmt->execute();

	$session = $stmt->fetch(PDO::FETCH_ASSOC);

	// 如果找不到會話，則返回錯誤
	if (!$session) {
		echo json_encode(array("success" => false, "message" => "無效的token"));
		return;
	}

	// 檢查會話是否過期
	$current_time = date('Y-m-d H:i:s');
	if ($session['expires_at'] < $current_time) {
		echo json_encode(array("success" => false, "message" => "會話已過期"));
		return;
	}

	// 返回成功資訊
	echo json_encode(array("success" => true, "message" => "token有效"));
}

/**
 * 處理獲取帳號資訊請求
 */
function handleGetAccountInfo() {
	$user_id = validateAuth();

	if (!$user_id) {
		echo json_encode(array("success" => false, "message" => "未授權的訪問"));
		return;
	}

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 查詢使用者資訊
	$stmt = $pdo->prepare("SELECT id, username, two_fa_enabled, created_at, updated_at FROM users WHERE id = :id");
	$stmt->bindParam(':id', $user_id);
	$stmt->execute();

	$user = $stmt->fetch(PDO::FETCH_ASSOC);

	// 如果找不到用戶，則返回錯誤
	if (!$user) {
		echo json_encode(array("success" => false, "message" => "獲取使用者資訊失敗"));
		return;
	}

	// 返回使用者資訊
	echo json_encode(array(
		"success" => true,
		"user" => $user,
	));
}

/**
 * 處理獲取2FA設定資訊請求
 */
function handleGet2FASetup() {
	$user_id = validateAuth();

	if (!$user_id) {
		echo json_encode(array("success" => false, "message" => "未授權的訪問"));
		return;
	}

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 查詢使用者資訊
	$stmt = $pdo->prepare("SELECT id, username, two_fa_enabled FROM users WHERE id = :id");
	$stmt->bindParam(':id', $user_id);
	$stmt->execute();

	$user = $stmt->fetch(PDO::FETCH_ASSOC);

	// 如果找不到用戶，則返回錯誤
	if (!$user) {
		echo json_encode(array("success" => false, "message" => "獲取使用者資訊失敗"));
		return;
	}

	// 檢查是否已啟用2FA
	if ($user['two_fa_enabled']) {
		echo json_encode(array("success" => false, "message" => "2FA已啟用"));
		return;
	}

	// 生成2FA密鑰
	$secret = bin2hex(random_bytes(16));

	// 更新用戶2FA密鑰
	$stmt = $pdo->prepare("UPDATE users SET two_fa_secret = :secret WHERE id = :id");
	$stmt->bindParam(':secret', $secret);
	$stmt->bindParam(':id', $user_id);

	if (!$stmt->execute()) {
		echo json_encode(array("success" => false, "message" => "更新2FA設置失敗"));
		return;
	}

	// 模擬生成QR Code URL（實際應用中請使用真實的2FA庫）
	$qrCodeUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAABrrFhUAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAABO1BMVEUAAACBw/9/wv+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/+Aw/8AAADI7s9TAAAAaHRSTlMAEEBggK/P3+//YDDfQN+AYBDPr4Ag38+fr2AQ79/PQCCAMGCvEECA38/vr2BAMN+AIO+vn88w34BgQBCvgN/v78/fr69AMCCvYJ/fz4AQn0DvMGCfII/v39+AUIBAcJ9wMJ9Qj3BQcHDC2gwAAAABYktHRAH/Ai3eAAAAB3RJTUUH5gIHCTkqIWgm+wAAAWxJREFUeNrt0jVWBQEQRMH5HuYEd3d319bR+08RAjaQurupL5DXAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/3Y0eqR3YXRiqPg5NT0zmxSVtedyFYBa6f9Wf6H0f2t4qfB/any58n+a9Xrp/9TgSuX/1OpG6f/U1nbl/9Tu3lLp/9T+wf5i5f/U0f5O7f+wsTl/Wvo/nZ9fnJX+T5dX1xel/9PO7d1t6f90//D4UPo/vT5N35f+T5/TL5+l/9P318d36f/0c7H7+yv9n86OD89K/6eTs/PT0v9pZ3fvtvR/unh+eS79n96+Nj9K/6fxo/Hj0v9pfG58ofR/Gl4ZXir9n8YXNYZL/6extfFa6f80tjFW+j+N7C6U/k8ju0ul/1N7p7VT+j+1dlv7pf9TY7+pUfo/NQ+aB6X/U+Oocar0f2qaapop/Z+a55rnS/+nxoXGhdL/qX2+fb70f2qbbZst/Q8AAAAAAAAAAAAAAAAAACzhH6bWb/KxvB1HAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDIyLTAyLTA3VDA5OjU3OjQyKzAwOjAwgp5H1QAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyMi0wMi0wN1QwOTo1Nzo0MiswMDowMPPD/2kAAAAASUVORK5CYII=";

	// 返回2FA設置資訊
	echo json_encode(array(
		"success" => true,
		"qrCodeUrl" => $qrCodeUrl,
		"secret" => $secret,
	));
}

/**
 * 處理更新帳號設定請求
 */
function handleUpdateAccount() {
	$user_id = validateAuth();

	if (!$user_id) {
		echo json_encode(array("success" => false, "message" => "未授權的訪問"));
		return;
	}

	// 檢查是否提供了當前密碼
	if (!isset($_POST['current_password']) || empty($_POST['current_password'])) {
		echo json_encode(array("success" => false, "message" => "請提供當前密碼以進行身份驗證"));
		return;
	}

	$current_password = $_POST['current_password'];

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 查詢使用者資訊
	$stmt = $pdo->prepare("SELECT * FROM users WHERE id = :id");
	$stmt->bindParam(':id', $user_id);
	$stmt->execute();

	$user = $stmt->fetch(PDO::FETCH_ASSOC);

	// 如果找不到用戶，則返回錯誤
	if (!$user) {
		echo json_encode(array("success" => false, "message" => "獲取使用者資訊失敗"));
		return;
	}

	// 驗證當前密碼
	if (!password_verify($current_password, $user['password'])) {
		mxp_save_error_log("Password verification failed for user ID: $user_id");
		echo json_encode(array("success" => false, "message" => "當前密碼不正確，無法更新設定"));
		return;
	}

	// 更新用戶名
	$username = $user['username'];
	if (isset($_POST['username']) && !empty($_POST['username'])) {
		$new_username = $_POST['username'];

		// 檢查用戶名是否已被使用
		$stmt = $pdo->prepare("SELECT id FROM users WHERE username = :username AND id != :id");
		$stmt->bindParam(':username', $new_username);
		$stmt->bindParam(':id', $user_id);
		$stmt->execute();

		if ($stmt->rowCount() > 0) {
			echo json_encode(array("success" => false, "message" => "用戶名已被使用"));
			return;
		}

		$username = $new_username;
	}

	// 更新密碼
	$password = $user['password'];
	if (isset($_POST['password']) && !empty($_POST['password'])) {
		$new_password = $_POST['password'];
		$password = password_hash($new_password, PASSWORD_DEFAULT);
	}

	// 更新2FA設置
	$two_fa_enabled = $user['two_fa_enabled'];
	$two_fa_secret = $user['two_fa_secret'];

	if (isset($_POST['enable2FA'])) {
		$enable2FA = (bool) $_POST['enable2FA'];

		if ($enable2FA && !$two_fa_enabled) {
			// 如果啟用2FA，需要驗證OTP
			if (!isset($_POST['otpVerify']) || empty($_POST['otpVerify'])) {
				echo json_encode(array("success" => false, "message" => "請輸入OTP驗證碼以確認2FA設定"));
				return;
			}

			$otpVerify = $_POST['otpVerify'];

			// 模擬2FA驗證（實際應用中請使用真實的2FA庫）
			if ($otpVerify !== '123456') { // 這只是示例，實際應用中不要使用固定驗證碼
				echo json_encode(array("success" => false, "message" => "OTP驗證碼錯誤"));
				return;
			}

			$two_fa_enabled = 1;
		} else if (!$enable2FA && $two_fa_enabled) {
			// 如果禁用2FA
			$two_fa_enabled = 0;
		}
	}

	// 更新使用者資訊
	$stmt = $pdo->prepare("UPDATE users SET
                           username = :username,
                           password = :password,
                           two_fa_secret = :two_fa_secret,
                           two_fa_enabled = :two_fa_enabled,
                           updated_at = CURRENT_TIMESTAMP
                           WHERE id = :id");

	$stmt->bindParam(':username', $username);
	$stmt->bindParam(':password', $password);
	$stmt->bindParam(':two_fa_secret', $two_fa_secret);
	$stmt->bindParam(':two_fa_enabled', $two_fa_enabled);
	$stmt->bindParam(':id', $user_id);

	if (!$stmt->execute()) {
		echo json_encode(array("success" => false, "message" => "更新使用者資訊失敗"));
		return;
	}

	// 返回成功資訊
	echo json_encode(array("success" => true, "message" => "使用者資訊已更新"));
}

/**
 * ======================
 * 流程圖相關處理函數
 * ======================
 */

/**
 * 處理獲取流程圖列表請求
 */
function handleListDiagrams() {
	$user_id = validateAuth();

	if (!$user_id) {
		echo json_encode(array("success" => false, "message" => "未授權的訪問"));
		return;
	}

	// 記錄請求數據用於調試
	mxp_save_error_log("List Diagrams - User ID: $user_id");

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	try {
		// 查詢流程圖列表
		$stmt = $pdo->prepare("SELECT id, name, created_at, updated_at FROM diagrams
                               WHERE user_id = :user_id
                               ORDER BY updated_at DESC");

		$stmt->bindParam(':user_id', $user_id);
		$stmt->execute();

		$diagrams = $stmt->fetchAll(PDO::FETCH_ASSOC);

		mxp_save_error_log("Found " . count($diagrams) . " diagrams for user: $user_id");

		// 返回流程圖列表
		echo json_encode(array(
			"success" => true,
			"diagrams" => $diagrams,
		));
	} catch (PDOException $e) {
		mxp_save_error_log("Database error in handleListDiagrams: " . $e->getMessage());
		echo json_encode(array("success" => false, "message" => "獲取流程圖列表時發生資料庫錯誤"));
	}
}

/**
 * 處理獲取流程圖請求
 */
function handleGetDiagram() {
	$user_id = validateAuth();

	if (!$user_id) {
		echo json_encode(array("success" => false, "message" => "未授權的訪問"));
		return;
	}

	// 檢查請求參數
	if (!isset($_GET['id'])) {
		echo json_encode(array("success" => false, "message" => "缺少必要參數"));
		return;
	}

	$id = $_GET['id'];

	// 記錄請求數據用於調試
	mxp_save_error_log("Get Diagram - User ID: $user_id, Diagram ID: $id");

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 查詢流程圖
	$stmt = $pdo->prepare("SELECT * FROM diagrams
                           WHERE id = :id AND user_id = :user_id");

	$stmt->bindParam(':id', $id);
	$stmt->bindParam(':user_id', $user_id);

	try {
		$stmt->execute();

		$diagram = $stmt->fetch(PDO::FETCH_ASSOC);

		// 如果找不到流程圖，則返回錯誤
		if (!$diagram) {
			mxp_save_error_log("Diagram not found - ID: $id, User ID: $user_id");
			echo json_encode(array("success" => false, "message" => "找不到指定的流程圖"));
			return;
		}

		// 返回流程圖資訊
		echo json_encode(array(
			"success" => true,
			"diagram" => $diagram,
		));
	} catch (PDOException $e) {
		mxp_save_error_log("Database error in handleGetDiagram: " . $e->getMessage());
		echo json_encode(array("success" => false, "message" => "獲取流程圖時發生資料庫錯誤"));
	}
}

/**
 * 處理儲存流程圖請求
 */
function handleSaveDiagram() {
	$user_id = validateAuth();

	if (!$user_id) {
		echo json_encode(array("success" => false, "message" => "未授權的訪問"));
		return;
	}

	// 檢查請求參數
	if (!isset($_POST['name']) || !isset($_POST['xml'])) {
		echo json_encode(array("success" => false, "message" => "缺少必要參數"));
		return;
	}

	$name = $_POST['name'];
	$xml = $_POST['xml'];

	// 獲取儲存模式
	$save_mode = isset($_POST['save_mode']) ? $_POST['save_mode'] : 'save';

	// 直接從請求中獲取原始ID值
	$raw_id = isset($_POST['id']) ? $_POST['id'] : 'not set';
	mxp_save_error_log("Original ID from request: '$raw_id', type: " . gettype($raw_id));

	// 處理ID參數
	$id = null;
	if (isset($_POST['id'])) {
		// 嚴格檢查ID：必須是數字或數字字串
		$id_value = $_POST['id'];

		// 移除任何前後空白
		$id_value = trim($id_value);

		// 檢查是否為有效數字
		if ($id_value !== "" && is_numeric($id_value)) {
			// 確保ID是整數
			$id = intval($id_value);
			mxp_save_error_log("Valid ID found and converted to integer: $id");
		} else {
			mxp_save_error_log("Invalid ID: '$id_value' - will create new record");
			$id = null;
		}
	} else {
		mxp_save_error_log("No ID provided in request");
	}

	// 記錄接收到的所有POST參數用於調試
	mxp_save_error_log("All POST parameters: " . print_r($_POST, true));

	// 如果是另存新檔模式，強制清空ID
	if ($save_mode === 'saveAs') {
		mxp_save_error_log("Save As mode - forcing ID to null");
		$id = null;
	}

	// 記錄請求數據用於調試
	mxp_save_error_log("Save Diagram - Mode: $save_mode, User ID: $user_id, Diagram ID: " . ($id !== null ? $id : 'new') . ", Name: $name");

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	try {
		// 查詢用戶的所有流程圖，用於調試
		$userDiagramsStmt = $pdo->prepare("SELECT id, name, created_at, updated_at FROM diagrams WHERE user_id = :user_id ORDER BY updated_at DESC");
		$userDiagramsStmt->bindParam(':user_id', $user_id, PDO::PARAM_INT);
		$userDiagramsStmt->execute();
		$userDiagrams = $userDiagramsStmt->fetchAll(PDO::FETCH_ASSOC);
		mxp_save_error_log("User's diagrams (user_id=$user_id): " . json_encode($userDiagrams));

		// 記錄當前資料庫統計資訊用於調試
		$statsStmt = $pdo->query("SELECT COUNT(*) as total, COUNT(DISTINCT user_id) as users FROM diagrams");
		$stats = $statsStmt->fetch(PDO::FETCH_ASSOC);
		mxp_save_error_log("Database stats: Total diagrams: {$stats['total']}, Total users: {$stats['users']}");

		// 如果是「另存新檔」模式，則直接創建新記錄，不考慮ID
		if ($save_mode === 'saveAs') {
			mxp_save_error_log("Save As mode: Creating a new diagram regardless of ID");
			// 強制覆蓋ID為null，確保創建新記錄
			$id = null;
		}

		// 處理「儲存」模式
		if ($id !== null && $save_mode === 'save') {
			mxp_save_error_log("Attempting to update diagram with ID: $id");

			// 首先檢查該ID的流程圖是否存在且屬於該用戶
			$checkStmt = $pdo->prepare("SELECT id FROM diagrams WHERE id = :id AND user_id = :user_id");
			$checkStmt->bindParam(':id', $id, PDO::PARAM_INT); // 明確指定參數類型為整數
			$checkStmt->bindParam(':user_id', $user_id, PDO::PARAM_INT);

			mxp_save_error_log("Checking diagram existence - ID: $id, User ID: $user_id");

			// 檢查用戶資訊
			$userCheckStmt = $pdo->prepare("SELECT id, username FROM users WHERE id = :user_id");
			$userCheckStmt->bindParam(':user_id', $user_id, PDO::PARAM_INT);
			$userCheckStmt->execute();
			$userInfo = $userCheckStmt->fetch(PDO::FETCH_ASSOC);
			mxp_save_error_log("User info: " . json_encode($userInfo));

			if (!$checkStmt->execute()) {
				$error = $checkStmt->errorInfo();
				mxp_save_error_log("Check diagram existence error: " . json_encode($error));
				echo json_encode(array("success" => false, "message" => "檢查流程圖失敗"));
				return;
			}

			// $diagramExists = $checkStmt->rowCount() > 0;
			$diagramExists = $checkStmt->fetch(PDO::FETCH_ASSOC) !== false;
			mxp_save_error_log("Diagram exists check result: " . ($diagramExists ? "YES" : "NO"));

			if (!$diagramExists) {
				// 如果找不到對應的記錄，則返回錯誤
				mxp_save_error_log("ERROR: Diagram ID $id not found for user $user_id");

				// 查詢所有流程圖以找出所有者
				$findOwnerStmt = $pdo->prepare("SELECT user_id FROM diagrams WHERE id = :id");
				$findOwnerStmt->bindParam(':id', $id, PDO::PARAM_INT);
				$findOwnerStmt->execute();
				$owner = $findOwnerStmt->fetch(PDO::FETCH_ASSOC);

				$errorMessage = "找不到ID為 $id 的流程圖";
				if ($owner) {
					mxp_save_error_log("Diagram ID $id belongs to user_id: {$owner['user_id']}, current user is: $user_id");
					$errorMessage .= "，或該流程圖不屬於您\n\n建議：使用「另存新檔」功能創建新的流程圖";
				}

				echo json_encode(array("success" => false, "message" => $errorMessage));
				return; // 直接返回，不繼續創建新記錄
			} else {
				mxp_save_error_log("Found existing diagram with ID: $id for user: $user_id, updating it");

				// 找到記錄，進行更新
				$updateSql = "UPDATE diagrams SET
                              name = :name,
                              xml = :xml,
                              updated_at = CURRENT_TIMESTAMP
                              WHERE id = :id AND user_id = :user_id";

				mxp_save_error_log("Update SQL: $updateSql");

				$stmt = $pdo->prepare($updateSql);

				// 明確指定參數類型
				$stmt->bindParam(':name', $name, PDO::PARAM_STR);
				$stmt->bindParam(':xml', $xml, PDO::PARAM_STR);
				$stmt->bindParam(':id', $id, PDO::PARAM_INT);
				$stmt->bindParam(':user_id', $user_id, PDO::PARAM_INT);

				// 在執行前記錄參數
				mxp_save_error_log("Executing UPDATE with parameters - ID: $id (type: " . gettype($id) . "), Name: $name, User ID: $user_id");

				if (!$stmt->execute()) {
					$error = $stmt->errorInfo();
					mxp_save_error_log("Update diagram error: " . json_encode($error));
					echo json_encode(array("success" => false, "message" => "更新流程圖失敗: " . $error[2]));
					return;
				}

				// 檢查是否真的更新了記錄
				$rowsUpdated = $stmt->rowCount();

				// PDO的rowCount在某些情況下可能不可靠，特別是當數據沒有實際變化時
				if ($rowsUpdated === 0) {
					mxp_save_error_log("UPDATE statement completed but rowCount = 0. This may be normal if content didn't change.");

					// 不管是否有實際變化，再次確認記錄確實存在
					$verifyStmt = $pdo->prepare("SELECT id FROM diagrams WHERE id = :id AND user_id = :user_id");
					$verifyStmt->bindParam(':id', $id, PDO::PARAM_INT);
					$verifyStmt->bindParam(':user_id', $user_id, PDO::PARAM_INT);
					$verifyStmt->execute();

					if ($verifyStmt->rowCount() === 0) {
						// 如果記錄不存在，還是有問題
						mxp_save_error_log("WARNING: After update, record still not found. This indicates a problem.");
						echo json_encode(array(
							"success" => false,
							"message" => "更新流程圖失敗，無法確認記錄存在",
						));
						return;
					} else {
						mxp_save_error_log("Verified record exists even though no rows were updated.");
					}
				} else {
					mxp_save_error_log("Successfully updated diagram ID: $id for user: $user_id, rows affected: $rowsUpdated");
				}

				// 返回成功資訊，即使rowCount=0（可能是內容沒有變化）
				echo json_encode(array(
					"success" => true,
					"message" => "流程圖已更新",
					"id" => $id,
					"updated" => true,
				));

				// 重要：在成功更新後返回，不要繼續執行插入操作
				return;
			}
		}

		// 如果ID為空或者在另存新檔模式下，創建新流程圖
		if ($id === null || $save_mode === 'saveAs') {
			// 創建新流程圖的邏輯
			if ($save_mode === 'saveAs') {
				mxp_save_error_log("Save As mode: Creating a new copy of the diagram explicitly requested");
			} else {
				mxp_save_error_log("Creating a new diagram (ID is null)");
			}

			// 構建插入SQL
			$insertSql = "INSERT INTO diagrams (name, xml, user_id) VALUES (:name, :xml, :user_id)";
			mxp_save_error_log("Insert SQL: $insertSql");

			$stmt = $pdo->prepare($insertSql);

			// 明確指定參數類型
			$stmt->bindParam(':name', $name, PDO::PARAM_STR);
			$stmt->bindParam(':xml', $xml, PDO::PARAM_STR);
			$stmt->bindParam(':user_id', $user_id, PDO::PARAM_INT);

			// 記錄插入參數
			mxp_save_error_log("Executing INSERT with parameters - Name: $name, User ID: $user_id");

			if (!$stmt->execute()) {
				$error = $stmt->errorInfo();
				mxp_save_error_log("Insert diagram error: " . json_encode($error));
				echo json_encode(array("success" => false, "message" => "創建流程圖失敗: " . $error[2]));
				return;
			}

			// 獲取新創建的ID
			$new_id = $pdo->lastInsertId();

			if (!$new_id) {
				mxp_save_error_log("Warning: Failed to get last insert ID");
				echo json_encode(array("success" => false, "message" => "創建流程圖成功，但無法獲取ID"));
				return;
			}

			mxp_save_error_log("New diagram created with ID: $new_id for user: $user_id");

			// 返回成功資訊
			$message = ($save_mode === 'saveAs') ? "流程圖已另存為新檔" : "流程圖已創建";
			echo json_encode(array(
				"success" => true,
				"message" => $message,
				"id" => $new_id,
			));
			return;
		}

		// 如果代碼執行到這裡，表示既不是更新也不是新建，這是不應該發生的
		mxp_save_error_log("ERROR: Reached end of handleSaveDiagram without executing any operation. ID: " . var_export($id, true) . ", Save mode: $save_mode");
		echo json_encode(array("success" => false, "message" => "未知的處理錯誤"));
	} catch (PDOException $e) {
		mxp_save_error_log("PDO Exception in handleSaveDiagram: " . $e->getMessage() . "\nTrace: " . $e->getTraceAsString());
		echo json_encode(array("success" => false, "message" => "處理流程圖時發生資料庫錯誤: " . $e->getMessage()));
	} catch (Exception $e) {
		mxp_save_error_log("General Exception in handleSaveDiagram: " . $e->getMessage() . "\nTrace: " . $e->getTraceAsString());
		echo json_encode(array("success" => false, "message" => "處理流程圖時發生錯誤: " . $e->getMessage()));
	}
}

/**
 * 處理重命名流程圖請求
 */
function handleRenameDiagram() {
	$user_id = validateAuth();

	if (!$user_id) {
		echo json_encode(array("success" => false, "message" => "未授權的訪問"));
		return;
	}

	// 檢查請求參數
	if (!isset($_POST['id']) || !isset($_POST['name'])) {
		echo json_encode(array("success" => false, "message" => "缺少必要參數"));
		return;
	}

	$id = $_POST['id'];
	$name = $_POST['name'];

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 更新流程圖名稱
	$stmt = $pdo->prepare("UPDATE diagrams SET
                           name = :name,
                           updated_at = CURRENT_TIMESTAMP
                           WHERE id = :id AND user_id = :user_id");

	$stmt->bindParam(':name', $name);
	$stmt->bindParam(':id', $id);
	$stmt->bindParam(':user_id', $user_id);

	if (!$stmt->execute()) {
		echo json_encode(array("success" => false, "message" => "重命名流程圖失敗"));
		return;
	}

	// 返回成功資訊
	echo json_encode(array(
		"success" => true,
		"message" => "流程圖已重命名",
	));
}

/**
 * 處理刪除流程圖請求
 */
function handleDeleteDiagram() {
	$user_id = validateAuth();

	if (!$user_id) {
		echo json_encode(array("success" => false, "message" => "未授權的訪問"));
		return;
	}

	// 檢查請求參數
	if (!isset($_POST['id'])) {
		echo json_encode(array("success" => false, "message" => "缺少必要參數"));
		return;
	}

	$id = $_POST['id'];

	// 獲取資料庫連接
	$pdo = getDBConnection();

	if (!$pdo) {
		echo json_encode(array("success" => false, "message" => "無法連接資料庫"));
		return;
	}

	// 刪除流程圖
	$stmt = $pdo->prepare("DELETE FROM diagrams
                           WHERE id = :id AND user_id = :user_id");

	$stmt->bindParam(':id', $id);
	$stmt->bindParam(':user_id', $user_id);

	if (!$stmt->execute()) {
		echo json_encode(array("success" => false, "message" => "刪除流程圖失敗"));
		return;
	}

	// 返回成功資訊
	echo json_encode(array(
		"success" => true,
		"message" => "流程圖已刪除",
	));
}
?>