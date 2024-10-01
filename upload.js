import fs from 'fs-extra';
import archiver from 'archiver';
import axios from 'axios';
import FormData from 'form-data';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const upload = async (folderPath) => {
  const zipFilePath = join(__dirname, 'test.zip');

  if (!fs.existsSync(folderPath)) return console.error(`Folder "${folderPath}" does not exist.`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = fs.createWriteStream(zipFilePath);
  
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(folderPath, false).finalize();
  });

  const formData = new FormData();
  formData.append('zipfile', fs.createReadStream(zipFilePath));

  try {
    const { data } = await axios.post('https://session-manager-x9wf.onrender.com/upload', formData, {
      headers: formData.getHeaders(),
    });
    console.log(data.accessKey);
    return data.accessKey
  } catch (error) {
    console.error('Upload failed:', error.message);
  } finally {
    await fs.remove(zipFilePath); // Clean up
  }
};

// // Example usage
// upload(join(__dirname, '/auth/session'));
