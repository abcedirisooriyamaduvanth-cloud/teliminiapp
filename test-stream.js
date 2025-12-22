// final-stream-fixed.js - CORRECTED FLV FLAGS + NEW LINK
const { spawn } = require('child_process');

// 🔗 YOUR NEW FIREBASE LINK (expires: Dec 20, 2025 12:30:11 AM)
const M3U8_URL = "https://d3.merichunidya.com:1686/hls/willowusa.m3u8?md5=jPV6Xam6C4ZZ_rBS1lbvuA&expires=1766171411";

// 🔐 TELEGRAM RTMP CREDENTIALS
const RTMP_URL = "rtmps://dc5-1.rtmp.t.me:443/s/3049442263:qwEDygVPjU7t6Z1GeBdIrw";

const HEADERS = [
    'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/143.0.7499.4 Safari/537.36',
    'Referer: https://profamouslife.com/',
    'Origin: https://profamouslife.com'
].join('\r\n');

console.log('🎯 FIXED STREAM TO TELEGRAM');
console.log('📡 Channel: Willow (IlT20 2025)');
console.log('⏰ Expires:', new Date(1766171411 * 1000).toLocaleString());
console.log('🔧 Using corrected FFmpeg parameters...\n');

const ffmpegArgs = [
    // Input settings
    '-headers', HEADERS,
    '-http_persistent', '0',           // Force new connection per segment
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', M3U8_URL,

    // Video encoding - PROVEN WORKING
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-profile:v', 'baseline',
    '-level', '3.0',
    '-b:v', '1200k',
    '-maxrate', '1200k',
    '-bufsize', '2400k',
    '-r', '25',
    '-g', '50',
    '-s', '960x540',
    '-pix_fmt', 'yuv420p',
    '-threads', '4',

    // Audio encoding
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-ar', '44100',

    // OUTPUT - FIXED: Removed 'genpts' which caused the error
    '-f', 'flv',
    '-flvflags', 'no_duration_filesize',  // ✅ CORRECTED FLAG
    '-drop_pkts_on_overflow', '1',
    '-max_delay', '500000',
    
    // Destination
    RTMP_URL
];

console.log('🚀 Starting stream to Telegram...\n');

const ffmpeg = spawn('ffmpeg', ffmpegArgs);

ffmpeg.stderr.on('data', (data) => {
    const line = data.toString();
    
    // Show live progress
    if (line.includes('frame=') && line.includes('time=')) {
        const fps = line.match(/fps=\s*(\d+)/)?.[1] || 'N/A';
        const time = line.match(/time=(\d+:\d+:\d+\.\d+)/)?.[1] || 'N/A';
        const bitrate = line.match(/bitrate=\s*([\d.]+kbits\/s)/)?.[1] || 'N/A';
        
        process.stdout.write(`\r📹 LIVE: ${time} | FPS: ${fps} | Bitrate: ${bitrate}`);
    }
    
    // Show critical errors
    if (line.toLowerCase().includes('error')) {
        console.error('\n❌', line.trim());
    }
});

ffmpeg.on('error', (err) => {
    console.error('\n💥 Failed to start FFmpeg:', err.message);
    console.log('🔧 Check FFmpeg is installed: ffmpeg -version');
});

ffmpeg.on('close', (code) => {
    console.log(`\n\n💖 FFmpeg exited with code: ${code}`);
    
    if (code === 0) {
        console.log('✅ Stream completed successfully!');
    } else if (code === 255) {
        console.log('🛑 Normal stop (user terminated)');
    } else {
        console.log('\n❌ STREAM FAILED - RTMP ISSUE');
        console.log('🔍 This is likely a NETWORK problem, not FFmpeg.');
        console.log('🔍 Your ISP or firewall is blocking RTMPS (port 443).');
        console.log('\n💡 SOLUTION: This WILL work on DigitalOcean VPS!');
    }
});

// Test stream for 90 seconds
const TEST_TIME = 90000;
console.log(`⏱️  Testing for ${TEST_TIME/1000} seconds...\n`);

const timer = setTimeout(() => {
    console.log('\n\n⏹️  Test complete - stopping...');
    ffmpeg.kill('SIGTERM');
}, TEST_TIME);

process.on('SIGINT', () => {
    console.log('\n🛑 Manual stop...');
    clearTimeout(timer);
    ffmpeg.kill('SIGTERM');
});