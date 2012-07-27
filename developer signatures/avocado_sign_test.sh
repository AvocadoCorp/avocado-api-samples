#-------------------------------------------------------------------------------
# Generates the authenticated signature needed for requests to the Avocado API.
#-------------------------------------------------------------------------------

# Ask the user for all of the necessary authentication info
read -p "Email of an Avocado account: " EMAIL
read -s -p "Password: " PASS
echo ""
read -p "Developer ID: " DEV_ID
read -p "Developer key: " DEV_KEY

# URL encode the email address
ENCODED_EMAIL=$(python -c "import urllib; print urllib.quote('''$EMAIL''')")

# Login and get the cookie
COOKIE_VALUE=`curl -d "email=$ENCODED_EMAIL&password=$PASS" -v https://avocado.io/api/authentication/login 2>&1 | grep -e '.*user_email=.*' | sed 's/\(.*\)user_email=\(.*\);\(.*\)/\2/'`

# Make a user token with the cookie and the developer's key
USER_TOKEN=$COOKIE_VALUE$DEV_KEY

# Hash the user token
HASHED_USER_TOKEN=$(python -c "import hashlib; m = hashlib.sha256(); m.update('''$USER_TOKEN'''); print m.hexdigest()")

# Get their signature
DEVELOPER_SIGNATURE=$DEV_ID:$HASHED_USER_TOKEN

#-------------------------------------------------------------------------------
# Ok, now verify that it works.
#-------------------------------------------------------------------------------

# Call the Avocado API and check that response is valid.
RESPONSE_CODE=`curl --cookie "user_email=$COOKIE_VALUE" --header "X-AvoSig: $DEVELOPER_SIGNATURE"  -sL -w "%{http_code}\\n" "https://avocado.io/api/user" -o /dev/null`
if [ $RESPONSE_CODE = "200" ]; then
    echo "SUCCESS."
    echo ""
    echo "Below is your Avocado API signature:"
    echo $DEVELOPER_SIGNATURE
    echo ""
else
    echo ""
    echo "FAILED.  Signature was tested and failed. Try again and check the auth information."
fi

# DONE. But...
#-----------------------------------------------------------------------------------------
# Allow passing an API path as an option to test that API call. (GET requests only.)
#-----------------------------------------------------------------------------------------
if [ -n "$1" ]; then
  # Call the Avocado API
  JSON=`curl --cookie "user_email=$COOKIE_VALUE" --header "X-AvoSig: $DEVELOPER_SIGNATURE" -s https://avocado.io$1`

  # Output the response with indentation to improve legibility.
  JSON_FEELING_PRETTY=$(python -c "import json; print json.dumps(json.loads('''$JSON'''), sort_keys=True, indent=2)")
  echo "$JSON_FEELING_PRETTY"
fi