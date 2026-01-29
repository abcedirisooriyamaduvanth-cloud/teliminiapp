# Monetag Ad Loading Troubleshooting Guide

## ✅ Issues Fixed in index.html

### 1. **Ad SDK Loading Problems**
- **Problem**: Ad SDK could take indefinite time to load, no feedback to user
- **Fix**: 
  - Added console logging to track SDK status
  - Added page load event listener to monitor when SDK becomes available
  - Extended timeout check from 50 attempts to 100 attempts (10 seconds)
  - Added proper error handling and logging

### 2. **No Error Messages During Ad Loading**
- **Problem**: If ads failed, users saw generic "Check connection" message
- **Fix**:
  - Added detailed error logging to browser console
  - Display timeout error if ad takes >30 seconds
  - Show which specific error occurred in alert messages
  - Added "This may take 5-30 seconds" message during loading

### 3. **Ad Timeout Issues**
- **Problem**: Ads could hang indefinitely with spinner spinning forever
- **Fix**:
  - Added 30-second timeout for each ad load
  - Proper cleanup of timeout on success
  - Clear error message if timeout occurs

### 4. **Function Validation**
- **Problem**: `show_10340427()` could be called before it exists
- **Fix**:
  - Added type check before calling ad function
  - Validate function exists in both `watchRewarded()` and `watchPopup()`
  - Better error message if function not found

### 5. **Async/Defer Script Loading**
- **Problem**: Ad SDK script wasn't being loaded asynchronously
- **Fix**:
  - Added `async="true"` and `defer="true"` attributes to libtl.com script
  - Added window load event listener for SDK availability

---

## 🔍 How to Debug Ad Issues

### Check Browser Console (F12 > Console)
Look for these messages:

```
✅ Ad SDK loaded successfully
✅ Ad watched successfully
❌ Ad failed to load

✅ Page load event fired
✅ Ad SDK already available
⚠️ Ad SDK not yet available, will retry
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| **"Ad SDK still loading"** | SDK takes >10s | Wait longer, check internet connection |
| **"Ad loading timed out"** | No response in 30s | Check connection, try again in 2 minutes |
| **"show_10340427 function not available"** | SDK never loaded | Refresh page, check if libtl.com is accessible |
| **Spinner never stops** | Promise rejection not caught | Open console to see actual error |
| **Click doesn't work** | Connection issue | Check if you can reach libtl.com |

---

## 📡 Connection Check

To verify the ad network is accessible:

```javascript
// Paste in browser console (F12 > Console):
fetch('https://libtl.com/sdk.js')
  .then(r => r.ok ? 'OK' : 'Status: ' + r.status)
  .catch(e => 'ERROR: ' + e.message)
  .then(console.log)
```

Expected: `OK` or `Status: 200`
If error: Ad network may be blocked by ISP/firewall

---

## 🛠️ Manual Testing

1. **Open in Telegram Web App** (required for Telegram auth)
2. **Open Developer Console**: Press `F12` or `Right-click > Inspect`
3. **Go to Console tab**
4. **Click "Watch Video Ad"**
5. **Check console for messages:**
   - Should see: `Starting rewarded ad watch...`
   - Then: `✅ Ad watched successfully` OR error details

---

## 📊 Server Connection

The app communicates with:
- **Firebase**: Tracks user data and earnings
- **libtl.com**: Serves Monetag ads
- **Telegram**: Mini-app authentication
- **Cloudflare Worker**: Generates channel invite links

If ads don't load but other features work:
- Firebase: ✅ (you see earnings/stats)
- Telegram: ✅ (you're logged in)
- **libtl.com: ❌** (ads won't load)

---

## 🔧 Fixes Applied

### In HTML `<head>`:
```html
<!-- Added async/defer and event listener -->
<script src="https://libtl.com/sdk.js" async="true" defer="true"></script>
<script>
  window.addEventListener('load', () => {
    console.log('✅ Ad SDK status: ' + (typeof show_10340427 === 'function' ? 'Ready' : 'Not ready'));
  });
</script>
```

### In `watchRewarded()` and `watchPopup()`:
- Added console logging (`console.log`, `console.error`)
- Added 30-second timeout
- Added function existence check
- Added better error messages with technical details

### In `loader()` function:
- Added timeout notice in loading message
- Clear indication this may take time

### At app startup:
- Added console logging of app status
- Log when SDK becomes available

---

## 📝 Next Steps if Issue Persists

1. **Clear browser cache** and refresh (Ctrl+Shift+R)
2. **Check your internet speed** - ads need stable connection
3. **Try from different network** - check if ISP is blocking
4. **Wait 2-3 minutes** between ad attempts - rate limiting may apply
5. **Restart Telegram** and re-open mini-app
6. **Report error from console** - F12 > Console > Right-click error > Copy

---

## 🎯 Success Indicators

After clicking "Watch Video Ad":
1. ✅ Loader appears with spinner
2. ✅ Ad window/popup opens (may cover the app)
3. ✅ Watch the ad completely
4. ✅ Close ad window
5. ✅ Minutes/earnings update in real-time
6. ✅ Ad click counter increases

If all ✅, your setup is working correctly!
