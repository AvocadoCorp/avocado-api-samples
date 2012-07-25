#!/usr/bin/env ruby

# For best results, run this from the command line.
#
# Run:
# ruby AvocadoSignTest.rb
#
# Then answer the following...
#    Email of an Avocado account:
#    Password:
#    Developer ID:
#    Developer key:
#
# If successful, you'll see your developer signature...
#    1:crazylongweirdlookinghashedstring

require 'cgi'
require 'digest'
require 'net/http'
require 'net/https'

$AVOCADO_API_HOST = "avocado.io"
$AVOCADO_API_PORT = 443
$AVOCADO_API_URL_BASE = "/api/";
$AVOCADO_API_URL_LOGIN = $AVOCADO_API_URL_BASE + "authentication/login";
$AVOCADO_API_URL_COUPLE = $AVOCADO_API_URL_BASE + "couple";
$AVOCADO_COOKIE_NAME = "user_email";
$AVOCADO_USER_AGENT = "Avocado Test Api Client v.1.0";
$ERROR_MSG = "\nFAILED. Signature was tested and failed. Try again and check the auth information."

class AvocadoAPI
  def initialize(auth_client)
    @auth_client = auth_client
    @couple = nil
  end

  def update_from_command_line
    @auth_client.update_from_command_line

    @auth_client.update_signature
    if @auth_client.dev_signature.nil?
      puts $ERROR_MSG
      return
    end

    update_couple
    if @couple.nil?
      puts $ERROR_MSG
    else
      puts "SUCCESS.\n\nBelow is your Avocado API signature:\n#{@auth_client.dev_signature}\n"
    end
  end

  def update_couple
    connection = Net::HTTP::new($AVOCADO_API_HOST, $AVOCADO_API_PORT)
    connection.verify_mode = OpenSSL::SSL::VERIFY_NONE
    connection.use_ssl = true
    resp, data = connection.get($AVOCADO_API_URL_COUPLE, get_signed_headers)
    if resp.code == "200"
      @couple = data
    end
  end

  def get_signed_headers
    return {
      'Cookie' => $AVOCADO_COOKIE_NAME + "=" + @auth_client.cookie,
      'X-AvoSig' => @auth_client.dev_signature,
      'User-Agent' => $AVOCADO_USER_AGENT
    }
  end

  attr_reader :auth_client
end


class AuthClient
  def initialize(email = nil, password = nil, dev_id = nil, dev_key = nil)
    @email = email
    @password = password
    @dev_id = dev_id
    @dev_key = dev_key
    @dev_signature = nil
    @cookie = nil
  end

  def get_cookie_from_login
    connection = Net::HTTP::new($AVOCADO_API_HOST, $AVOCADO_API_PORT)
    connection.verify_mode = OpenSSL::SSL::VERIFY_NONE
    connection.use_ssl = true

    resp, data = connection.post(
      $AVOCADO_API_URL_LOGIN,
      "email=" + CGI.escape(@email) + "&password=" + CGI.escape(@password),
        {})

    if resp.code != "200"
      @cookie = nil
    else
      @cookie = get_cookie_from_response(resp, $AVOCADO_COOKIE_NAME)
    end
  end

  def update_from_command_line
    @email = get_input("Email of an Avocado account: ")
    @password = get_input_silently("Password: ")
    @dev_id = get_input("Developer ID: ")
    @dev_key = get_input("Developer key: ")
  end

  def update_signature
    get_cookie_from_login
    if @cookie.nil?
      puts "The cookie is missing. Login must have failed."
      return
    end

    # Hash the user token.
    hashed_user_token = Digest::SHA256.new << @cookie + @dev_key

    # Get their signature.
    @dev_signature = "#{@dev_id}:#{hashed_user_token}"
  end

  attr_reader :cookie
  attr_reader :dev_signature
end

def get_cookie_from_response(resp, cookie_name)
  all_cookies = resp.get_fields('Set-cookie')
  all_cookies.each { | cookie |
      cookie_string = cookie.split('; ')[0]
      cookie_parts = cookie_string.split('=', 2)
      if cookie_parts[0] == cookie_name
        return cookie_parts[1]
      end
  }
  return nil
end

def get_input(msg)
  print msg
  return $stdin.gets.chomp
end

def get_input_silently(msg)
  # NOTE: stty only works on *nix systems.
  system "stty -echo"
  input = get_input(msg)
  system "stty echo"
  print "\n";
  return input;
end

# Comment these out if you don't want to use this as a command-line script.
api = AvocadoAPI.new(AuthClient.new())
api.update_from_command_line
