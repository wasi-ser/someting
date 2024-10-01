import fs from 'fs-extra';
import archiver from 'archiver';
import axios from 'axios';
import FormData from 'form-data';
import path from 'path';

export const uploadSession = async (folderPath) => {
  const outputPath = path.join(path.dirname(folderPath), 'uploaded.zip'); // Path for the temporary zip file

  try {
    // Step 1: Create a `.zip` file from the provided folder
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        console.log(`Created zip file: ${outputPath} (${archive.pointer()} total bytes)`);
        
        // Step 2: Upload the `.zip` file to the API
        const fileStream = fs.createReadStream(outputPath);
        const formData = new FormData();
        formData.append('zipfile', fileStream);

        try {
          const response = await axios.post('http://localhost:5000/upload', formData, {
            headers: {
              ...formData.getHeaders(),
            },
          });

          console.log('Upload successful. Server response:', response.data);
          resolve(response.data.accessKey); // Return the access key
        } catch (error) {
          console.error('Upload failed:', error.message);
          reject(error); // Propagate the error
        }
      });

      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      archive.directory(folderPath, false); // Include all files in the specified folder
      archive.finalize();
    });
  } catch (err) {
    console.error('Error during upload process:', err.message);
    throw err; // Propagate the error
  } finally {
    // Optionally, clean up the generated zip file after upload
    await fs.remove(outputPath);
  }
};

// // Example usage
// (async () => {
//   const folderPath = 'path/to/your/folder'; // Replace with your actual folder path
//   try {
//     const accessKey = await uploadSession(folderPath);
//     console.log('Access Key:', accessKey);
//   } catch (error) {
//     console.error('Error uploading folder:', error.message);
//   }
// })();
