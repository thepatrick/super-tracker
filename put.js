const fs = require('fs');
const readline = require('readline');
const google = require('googleapis');
const GoogleAuth = require('google-auth-library');
const util = require('util');
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const { TOKEN_DIR, SPREADSHEET_ID } = process.env;
const TOKEN_PATH = path.join(TOKEN_DIR, 'sheets.json');
const CLIENT_SECRET = path.join(TOKEN_DIR, 'client-secret.json');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const sheets = google.sheets('v4');
const getValues = util.promisify(sheets.spreadsheets.values.get).bind(sheets.spreadsheets.values);
const appendValues = util.promisify(sheets.spreadsheets.values.append);

async function getClientSecret() {
  try {
    const content = await readFile(CLIENT_SECRET);
    const credentials = JSON.parse(content);
    return credentials;
  } catch (err) {
    throw new Error(`Error loading client secret file: ${err.message} (${err.code})`);
  }
}

async function readToken() {
  try {
    return JSON.parse(await readFile(TOKEN_PATH));
  } catch (err) {
    return undefined;
  }
}
/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
async function storeToken(token) {
  try {
    await mkdir(TOKEN_DIR);
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
  await writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log(`Token stored to ${TOKEN_PATH}`);
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
async function getNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await askQuestion(rl, 'Enter the code from that page here: ');

  rl.close();

  try {
    const getTokenAsync = util.promisify(oauth2Client.getToken).bind(oauth2Client);
    const token = await getTokenAsync(code);
    await storeToken(token);
    return token;
  } catch (err) {
    throw new Error(`Eror while trying to retrieve access token: ${err.message} (${err.code})`);
  }
}

async function getClient() {
  // Load client secrets from a local file.
  const {
    client_secret: clientSecret,
    client_id: clientId,
    redirect_uris: [redirectUrl],
  } = (await getClientSecret()).installed;

  const auth = new GoogleAuth();

  // Authorize a client with the loaded credentials
  const oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  let token = await readToken();
  if (!token) {
    token = await getNewToken(oauth2Client);
  }
  oauth2Client.credentials = token;

  return oauth2Client;
}

module.exports = async function addRow(transactionTotal, sharesTotal, highGrowthTotal) {
  const auth = await getClient();

  console.log('ok, lets try using it');
  console.log('****************************');

  // Print the names and majors of students in a sample spreadsheet:
  // https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit


  try {
    const today = new Date();

    const meow = await appendValues({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        range: 'Sheet1',
        majorDimension: 'ROWS',
        values: [
          [
            `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`, // 2017-09-08
            '=INDIRECT("R[0]C[1]", FALSE)+INDIRECT("R[0]C[5]", FALSE)',
            '=SUM(INDIRECT("R[0]C[1]", FALSE):INDIRECT("R[0]C[3]", FALSE))',
            transactionTotal,
            sharesTotal,
            highGrowthTotal,
          ],
        ],
      },
    });

    const { values: rows } = await getValues({
      auth,
      spreadsheetId: '1_V73BT6asKWDnnGggGoygXAipPGfrEm2kKSU76u-d7g',
      range: meow.updates.updatedRange,
    });

    if (rows.length === 0) {
      throw new Error('No data found.');
    } else {
      const [date, total, australianSuper, transaction, shares, highGrowth] = rows[0];
      return {
        date, total, australianSuper, transaction, shares, highGrowth,
      };
    }
  } catch (err) {
    throw new Error(`The API returned an error: ${err.message} (${err.code})`);
  }
};
