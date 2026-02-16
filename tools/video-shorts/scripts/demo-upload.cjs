const fs = require('fs');
const path = require('path');

const TOKEN = 'act.IQUytaJkM6WyYGQKZQMUbZaImhoTMK9dpt63I2HjXoUwgrMKjVlTjhv5kLxd!5269.va';
const API = 'https://open.tiktokapis.com';
const videoPath = path.join(__dirname, '..', 'output', 'feature-highlight-1771090169130.mp4');

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  InterviewBot - TikTok Upload Demo');
  console.log('========================================');
  console.log('');

  // Verify credentials
  console.log('[1/4] Verifying TikTok credentials...');
  const userRes = await fetch(API + '/v2/user/info/?fields=open_id,display_name', {
    headers: { 'Authorization': 'Bearer ' + TOKEN }
  });
  const userData = await userRes.json();
  console.log('  Authenticated as:', userData.data.user.display_name);
  console.log('');

  // Read video
  const video = fs.readFileSync(videoPath);
  console.log('[2/4] Initializing video upload...');
  console.log('  File:', path.basename(videoPath));
  console.log('  Size:', (video.length / 1024 / 1024).toFixed(2), 'MB');

  const initRes = await fetch(API + '/v2/post/publish/inbox/video/init/', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: video.length,
        chunk_size: video.length,
        total_chunk_count: 1,
      },
    }),
  });
  const initData = await initRes.json();
  console.log('  Publish ID:', initData.data.publish_id);
  console.log('');

  // Upload
  console.log('[3/4] Uploading video to TikTok...');
  const uploadRes = await fetch(initData.data.upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': 'bytes 0-' + (video.length - 1) + '/' + video.length,
    },
    body: video,
  });
  console.log('  Upload status:', uploadRes.status === 201 ? 'SUCCESS (201)' : uploadRes.status);
  console.log('');

  // Check status
  console.log('[4/4] Checking publish status...');
  await new Promise(r => setTimeout(r, 3000));
  const statusRes = await fetch(API + '/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: initData.data.publish_id }),
  });
  const statusData = await statusRes.json();
  console.log('  Status:', statusData.data.status);
  console.log('');

  console.log('========================================');
  console.log('  Upload complete! Video is processing.');
  console.log('========================================');
  console.log('');
}

main().catch(console.error);
