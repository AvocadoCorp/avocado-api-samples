/**
 * For best results, run this from the command line.
 *
 * Run:
 * javac AvocadoSignTest.java; java AvocadoSignTest
 *
 * Then answer the following...
 *    Email of an Avocado account:
 *    Password:
 *    Developer ID:
 *    Developer key:
 *
 * If successful, you'll see your developer signature...
 *    1:crazylongweirdlookinghashedstring
 */

import java.io.BufferedReader;
import java.io.Console;
import java.io.DataOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.lang.StringBuffer;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.ProtocolException;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public class AvocadoSignTest {
  static final String API_URL_BASE = "https://avocado.io/api/";
  static final String API_URL_LOGIN = API_URL_BASE + "authentication/login";
  static final String API_URL_COUPLE = API_URL_BASE + "couple";
  static final String COOKIE_NAME = "user_email";
  static final String USER_AGENT = "Avocado Test Api Client v.1.0";
  static final String ERROR_MSG = "\nFAILED.  Signature was tested and failed. " +
      "Try again and check the auth information.";

  public AvocadoSignTest() {}

  public class AvocadoAPI {
    private final AuthClient authClient;
    private String coupleData = null;

    public AvocadoAPI(AuthClient authClient) {
      this.authClient = authClient;
    }

    public void updateFromCommandLine() {
      this.authClient.updateFromCommandLine();

      this.authClient.updateSignature();
      if (this.authClient.getSignature() == null) {
        System.out.println(ERROR_MSG);
        return;
      }

      this.updateCouple();
      if (this.coupleData == null) {
        System.out.println(ERROR_MSG);
      } else {
        System.out.println("\nBelow is your Avocado API signature:");
        System.out.println(this.authClient.getSignature());
      }
    }

    public boolean updateCouple() {
      URL url = null;
      try {
        url = new URL(API_URL_COUPLE);
      } catch(MalformedURLException e) {
        System.out.println(e.toString());
        return false;
      } catch(IOException e) {
        System.out.println(e.toString());
        return false;
      }

      boolean isValid = false;

      HttpURLConnection connection = null;
      try {
        connection = (HttpURLConnection) url.openConnection();
        connection.setRequestProperty("Cookie", COOKIE_NAME + "=" + this.authClient.getCookie());
        connection.setRequestProperty("X-AvoSig", this.authClient.getSignature());
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.connect();

        int responseCode = connection.getResponseCode();
        if (responseCode == 200) isValid = true;

      } catch(IOException e) {
        System.out.println(e.toString());

      } finally {
        if (connection != null) {
          connection.disconnect();
        }
        if (isValid) {
          this.coupleData = "{}"; // TODO: Extract the response body for realz.
        }
        return isValid;
      }
    }
  }

  public class AuthClient {
    private String email = null;
    private char[] password = null;
    private int devId = 0;
    private String devKey = null;
    private String devSignature = null;
    private String cookie = null;

    public AuthClient() {}

    public String getCookie() {
      return this.cookie;
    }

    public String getSignature() {
      return this.devSignature;
    }

    public String getDevKey() {
      return this.devKey;
    }

    private void updateCookieFromLogin() {
      String data;
      try {
        data = "email=" + URLEncoder.encode(this.email, "UTF-8") +
               "&password=" + URLEncoder.encode(new String(this.password), "UTF-8");
      } catch(UnsupportedEncodingException e) {
        System.out.println(e.toString());
        return;
      }

      URL url = null;
      try {
        url = new URL(API_URL_LOGIN);
      } catch(MalformedURLException e) {
        System.out.println(e.toString());
        return;
      } catch(IOException e) {
        System.out.println(e.toString());
        return;
      }

      String cookieValue = null;

      HttpURLConnection connection = null;
      try {
        connection = (HttpURLConnection) url.openConnection();
        connection.setDoInput(true);
        connection.setDoOutput(true);
        connection.setUseCaches(false);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setRequestProperty("Content-Type",
            "application/x-www-form-urlencoded");

        DataOutputStream dataOut = new DataOutputStream(
                connection.getOutputStream());
        dataOut.writeBytes(data);
        dataOut.flush();
        dataOut.close();

        connection.connect();

        int responseCode = connection.getResponseCode();
        if (responseCode != 200) return;

        String headerName = null;
        for (int i = 1; (headerName = connection.getHeaderFieldKey(i)) != null; i++) {
          if (headerName.equals("Set-Cookie")) {
            String cookie = connection.getHeaderField(i);
            cookie = cookie.substring(0, cookie.indexOf(";"));
            cookieValue = cookie.split("=", 2)[1];
          }
        }

      } catch(IOException e) {
        System.out.println(e.toString());

      } finally {
        if (connection != null) {
          connection.disconnect();
        }
        this.cookie = cookieValue;
      }
    }

    private String generateHashedUserToken(String userToken) {
      MessageDigest hasher = null;
      try {
        hasher = MessageDigest.getInstance("SHA-256");
      } catch (NoSuchAlgorithmException e) {
        // pass
      }

      byte[] bytes = userToken.getBytes();
      byte[] digest = hasher.digest(bytes);
      StringBuffer result = new StringBuffer();
      for (int i : digest) {
        String hex = Integer.toHexString(0xFF & i);
        if (hex.length() == 1) {
          result.append("0");
        }
        result.append(hex);
      }
      return result.toString();
    }

    public void updateFromCommandLine() {
      Console c = System.console();
      this.email = c.readLine("Email of an Avocado account: ");
      this.password = c.readPassword("Password: ");
      this.devId = Integer.parseInt(c.readLine("Developer ID: "));
      this.devKey = c.readLine("Developer key: ");
    }

    public void updateSignature() {
      this.updateCookieFromLogin();
      if (this.cookie == null) {
        System.out.println("The cookie is missing. Login must have failed.");
        return;
      }

      // Hash the user token.
      String hashedUserToken = generateHashedUserToken(
          this.cookie + this.devKey);

      // Get their signature.
      this.devSignature = this.devId + ":" + hashedUserToken;
    }
  }

  public static void main(String[] args) {
    AvocadoSignTest signTest = new AvocadoSignTest();
    AvocadoSignTest.AuthClient authClient = signTest.new AuthClient();
    AvocadoSignTest.AvocadoAPI api = signTest.new AvocadoAPI(authClient);
    api.updateFromCommandLine();
  }
}
