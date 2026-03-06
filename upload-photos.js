#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const https = require('https');
const http = require('http');

const API_BASE = 'http://localhost:8000';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NDA2NzYyMjYsImV4cCI6MTc0MTI4MTA2N30.3Uh8VEE5bVM0aXx7rKV-GkPvT5JCG5-ZDO7scRR6cAk';

// Photos to upload: [filePath, eventName, memberTag]
const photosToUpload = [
  // XAMA photos
  ['images/xama/xama-1.jpg', 'XAMA Live House', 'Group'],
  ['images/xama/xama-2.jpg', 'XAMA Live House', 'Group'],
  ['images/xama/xama-3.jpg', 'XAMA Live House', 'Group'],
  ['images/xama/xama-4.jpg', 'XAMA Live House', 'Group'],
  ['images/xama/xama-5.jpg', 'XAMA Live House', 'Group'],
  ['images/xama/xama-6.jpg', 'XAMA Live House', 'Group'],
  // Spring Festival photos
  ['images/SpFes/sp-1.jpg', 'SKBY × HCCA Spring Festival', 'Group'],
  ['images/SpFes/sp-2.jpg', 'SKBY × HCCA Spring Festival', 'Group'],
  ['images/SpFes/sp-3.jpg', 'SKBY × HCCA Spring Festival', 'Group'],
  ['images/SpFes/sp-4.jpg', 'SKBY × HCCA Spring Festival', 'Group'],
];

// First, get event IDs
async function getEventId(eventName) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}/api/events`);
    const client = url.protocol === 'https:' ? https : http;
    
    client.get(url, { headers: { 'Authorization': `Bearer ${TOKEN}` } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const events = JSON.parse(data);
          const event = events.find(e => e.title === eventName);
          resolve(event ? event.id : null);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Upload a photo
async function uploadPhoto(filePath, eventId, memberTag) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);
    const form = new FormData();
    
    form.append('photo', fileStream, fileName);
    form.append('event_id', eventId.toString());
    form.append('member_tag', memberTag);
    form.append('caption', fileName.replace(/\.[^/.]+$/, ''));
    
    const url = new URL(`${API_BASE}/api/photos`);
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(url, {
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${TOKEN}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, fileName });
        } else {
          reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    form.pipe(req);
  });
}

// Main execution
async function main() {
  try {
    console.log('Starting photo upload...\n');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const [filePath, eventName, memberTag] of photosToUpload) {
      try {
        console.log(`Processing: ${filePath}`);
        
        // Get event ID
        const eventId = await getEventId(eventName);
        if (!eventId) {
          console.error(`  ✗ Event not found: ${eventName}`);
          failCount++;
          continue;
        }
        
        // Upload photo
        const result = await uploadPhoto(filePath, eventId, memberTag);
        console.log(`  ✓ Uploaded: ${result.fileName}`);
        successCount++;
      } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
        failCount++;
      }
    }
    
    console.log(`\n✓ Complete: ${successCount} uploaded, ${failCount} failed`);
    process.exit(failCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
