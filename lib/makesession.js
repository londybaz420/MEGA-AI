import { fileURLToPath } from 'url';
import path from 'path';
import { writeFileSync } from 'fs';
import fetch from 'node-fetch';

async function SaveCreds(txt) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const credsPath = path.join(__dirname, '..', 'session', 'creds.json');

try {
   // Change Sarkarmd$ as Prince$
    if (txt.startsWith('EDITH-MD~')) {
      const base64Data = txt.replace('EDITH-MD~', '');
      const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
      writeFileSync(credsPath, decodedData);
      console.log('Base64 credentials saved to creds.json');
      return true;
    }
    // DropBox handler jo apka Hai
    if (txt.startsWith('Prince~')) {
      const dropboxCode = txt.replace('Prince~', '');
      const dropboxUrl = `https://www.dropbox.com/${dropboxCode}&dl=1`;
      
      const response = await fetch(dropboxUrl);
      if (!response.ok) throw new Error(`Dropbox download failed: ${response.statusText}`);
      
      const data = await response.text();
      writeFileSync(credsPath, data);
      console.log('Dropbox credentials saved to creds.json');
      return true;
    }
    
    throw new Error('Invalid input: Must start with Sarkarmd$ or Prince~');
    
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

export default SaveCreds;
