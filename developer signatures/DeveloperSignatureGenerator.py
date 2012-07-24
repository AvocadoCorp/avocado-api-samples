
import cookielib
import getpass
import hashlib
import logging
import json
import urllib
import urllib2

AVOCADO_API_URL_BASE = "https://avocado.io/api/";
AVOCADO_API_URL_LOGIN = AVOCADO_API_URL_BASE + "authentication/login";
AVOCADO_API_URL_COUPLE = AVOCADO_API_URL_BASE + "couple";
AVOCADO_COOKIE_NAME = "user_email";
AVOCADO_USER_AGENT = "Avocado Test Api Client v.1.0";
ERROR_MSG = "FAILED.  Signature was tested and failed. Try again and check the auth information."

class AvocadoAPI(object):
  def __init__(self, auth_client):
    '''
    @type authClient: L{AuthClient}
    '''
    self.auth_client = auth_client
    self.couple = None

  def update_from_command_line(self):
    # Ask the user for all of the necessary authentication info
    self.auth_client.email = raw_input("Email of an Avocado account: ")
    self.auth_client.password = getpass.getpass()
    self.auth_client.dev_id = int(raw_input("Developer ID: "))
    self.auth_client.dev_key = raw_input("Developer key: ")

    self.auth_client.update_signature()
    if self.auth_client.dev_signature is None:
      print ERROR_MSG
      return

    self.update_couple();
    if self.couple is None:
      print ERROR_MSG
    else:
      print "\nBelow is your Avocado API signature:"
      print self.auth_client.dev_signature

  def update_couple(self):
    try:
      cookies = cookielib.CookieJar()
      request = urllib2.Request(
        url = AVOCADO_API_URL_COUPLE,
        headers = {
          "Content-type": "application/x-www-form-urlencoded",
          "User-Agent": AVOCADO_USER_AGENT,
          "X-AvoSig": self.auth_client.dev_signature,
          }
      )
      request.add_header('Cookie',
        '%s=%s' % (AVOCADO_COOKIE_NAME, self.auth_client.cookie_value))
      self.couple = urllib2.urlopen(request)

    except urllib2.URLError, e:
      logging.error(e.read())


class AuthClient(object):
  def __init__(self, email = None, password = None, dev_id = 0, dev_key = None):
    '''
    @type email: C{string}
    @type password: C{string}
    @type dev_id: C{int}
    @type dev_key: C{string}
    '''
    self.email = email
    self.password = password
    self.dev_id = dev_id
    self.dev_key = dev_key
    self.dev_signature = None
    self.cookie_value = None

  def get_cookie_from_login(self):
    params = urllib.urlencode({
      "email": self.email,
      "password": self.password,
    })
    try:
      request = urllib2.Request(
        url = AVOCADO_API_URL_LOGIN,
        data = params,
        headers = {
            "Content-type": "application/x-www-form-urlencoded",
            "User-Agent": AVOCADO_USER_AGENT
            }
        )
      response = urllib2.urlopen(request)

      cookies = cookielib.CookieJar()
      cookies.extract_cookies(response, request)
      for cookie in cookies:
          if cookie.name == AVOCADO_COOKIE_NAME:
               self.cookie_value = cookie.value
               break
    except urllib2.URLError, e:
      logging.error(e.read())

  def hash_signature(self):
    hasher = hashlib.sha256()
    hasher.update(self.cookie_value + self.dev_key)
    self.dev_signature = '%d:%s' % (self.dev_id, hasher.hexdigest())

  def update_signature(self):
    self.get_cookie_from_login()
    if self.cookie_value is not None:
      self.hash_signature()


def main():
  logging.basicConfig(level=logging.DEBUG)
  api = AvocadoAPI(AuthClient())
  api.update_from_command_line()


if __name__ == '__main__':
  main()
