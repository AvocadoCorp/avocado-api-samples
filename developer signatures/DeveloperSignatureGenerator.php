<?php

define("_AVOCADO_API_URL_BASE", "https://avocado.io/api/");
define("_AVOCADO_API_URL_LOGIN", _AVOCADO_API_URL_BASE . "authentication/login");
define("_AVOCADO_API_URL_COUPLE", _AVOCADO_API_URL_BASE . "couple");
define("_AVOCADO_COOKIE_NAME", "user_email");
define("_AVOCADO_USER_AGENT", "Avocado Test Api Client v.1.0");

// Comment these out if you don't want to use this as a command-line script.
$api = new AvocadoAPI();
$api->updateFromCommandLineInput();

class AvocadoAPI {
  var $couple,
      $authManager;

  function AvocadoAPI() {
    $this->authManager = new AvocadoAuthManager();
  }

  function updateFromCommandLineInput() {
    $this->authManager->updateAuthFromCommandLineInput();
    $this->updateCouple();

    # Check that the response from the Avocado API was valid.
    if ($this->couple == null) {
      print "FAILED.  Signature was tested and failed. Try again and check the auth information.\n";
    } else {
      print "SUCCESS.\n\nBelow is your Avocado API signature:\n" .
        $this->authManager->signature . "\n";
    }
  }

  function updateCouple() {
    # Send the POST request.
    $ch = curl_init(_AVOCADO_API_URL_COUPLE);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $this->signCurlRequest($ch);
    $output = curl_exec($ch);
    $response_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    # Use the HTTP response code to test if a valid API request was made.
    $this->couple = $response_code == 200 ? json_decode($output) : null;
  }

  function signCurlRequest($ch) {
    curl_setopt($ch, CURLOPT_COOKIE, _AVOCADO_COOKIE_NAME . "=" . $this->authManager->cookie);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array("X-AvoSig: " . $this->authManager->signature));
    curl_setopt($ch, CURLOPT_USERAGENT, _AVOCADO_USER_AGENT);
  }
}


class AvocadoAuthManager {
  var $cookie,
      $developer_id,
      $developer_key,
      $email,
      $password,
      $signature;

  function AvocadoAuthManager() {}

  function updateAuthFromCommandLineInput() {
    # Ask the user for all of the necessary authentication info
    $this->email = get_input("Email of an Avocado account");
    $this->password = get_input_silently("Password");
    $this->developer_id = get_input("Developer ID");
    $this->developer_key = get_input("Developer key");
    $this->updateSignature();
  }

  function updateSignature() {
    # Get a new cookie by logging into Avocado.
    $this->updateLoginCookie();

    # Hash the user token.
    $hashed_user_token = hash("sha256", $this->cookie . $this->developer_key);

    # Store the new signature.
    $this->signature = $this->developer_id . ":" . $hashed_user_token;
  }

  function updateLoginCookie() {
    $fields = array(
      'email'=>urlencode($this->email),
      'password'=>urlencode($this->password)
    );

    # Send the POST request.
    $ch = curl_init(_AVOCADO_API_URL_LOGIN);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_POST, count($fields));
    curl_setopt($ch, CURLOPT_POSTFIELDS,  get_querystring_from_array($fields));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERAGENT, _AVOCADO_USER_AGENT);
    $header = substr(curl_exec($ch), 0, curl_getinfo($ch, CURLINFO_HEADER_SIZE));
    curl_close($ch);

    # Store the cookie for use in later API requests.
    $this->cookie = get_cookie_from_header($header, _AVOCADO_COOKIE_NAME);
  }
}


#-----------------------------------------------------
# Mama's little helpers: functions we needed for this.
#-----------------------------------------------------

function get_querystring_from_array($fields) {
  foreach($fields as $key=>$value) { $fields_string .= $key.'='.$value.'&'; }
  rtrim($fields_string, '&');
  return $fields_string;
}

function get_cookie_from_header($header, $cookie_name) {
  preg_match('/^Set-Cookie: ' . $cookie_name . '=(.*?);/m', $header, $cookie_array);
  return $cookie_array[1];
}

function get_input_silently($msg){
  # NOTE: stty only works on *nix systems.
  system('stty -echo');
  $input = get_input("Password");
  system('stty echo');
  print "\n";
  return $input;
}

function get_input($msg){
  fwrite(STDOUT, "$msg: ");
  return trim(fgets(STDIN));
}

?>