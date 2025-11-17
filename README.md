# CCC Ticket Sniper - Reloader

A browser-based auto-reloader script for precisely timed page reloads during CCC Congress ticket sales.

**Original Creator:** [Lorenz Leutgeb](https://lorenz.leutgeb.xyz/) ([GitHub](https://github.com/lorenzleutgeb/))

## What It Does

This script synchronizes your browser with the server's clock and automatically reloads the page at exactly the right moment when tickets go on sale. It helps compensate for any time drift between your local clock and the ticket server.

### Key Features

- **Clock Synchronization**: Continuously measures and adjusts for the offset between your local clock and the server's clock
- **High Precision**: Uses `performance.now()` for microsecond-level timing accuracy
- **Smart Triggering**: Automatically reloads the page at the configured sale time
- **Testing Mode**: Includes a safe testing mode that measures timing without actually reloading

## How It Works

1. **Time Offset Measurement**: Every 5 seconds, the script sends a HEAD request to the server and compares the `Date` header with your local time to calculate the clock offset
2. **Averaging**: Uses the average of the last 5 measurements for stability
3. **Precision Checking**: Checks every 20ms whether it's time to reload
4. **Auto-Stop**: Stops measuring shortly before the target time to avoid interference
5. **Reload**: Triggers a page reload at the precise moment calculated from the server time

## Usage

### 1. Open the Ticket Purchase Page

Navigate to the CCC ticket purchase page in your browser:
```
https://tickets.events.ccc.de/
```

Then select the specific event you want to buy tickets for until you see ticket prices.

### 2. Open Browser Console

- **Chrome/Edge**: Press `F12` or `Ctrl+Shift+J` (Windows/Linux) / `Cmd+Option+J` (Mac)
- **Firefox**: Press `F12` or `Ctrl+Shift+K` (Windows/Linux) / `Cmd+Option+K` (Mac)
- **Safari**: Enable Developer menu in Preferences, then press `Cmd+Option+C`

### 3. Paste and Run the Script

Copy the entire contents of `reloader.js` and paste it into the console, then press Enter.

### 4. Monitor the Output

The script will log status information:
```
Now: [current date/time]
Target: [sale date/time]
Ready! Let's get that ticket!
```

You'll see periodic measurements of clock offset:
```
Ours: 1731859800000
Theirs: 1731859801234
Current Offset: 1234
Avg. Offset: 987
```

### 5. Wait

Leave the tab open and active. The script will automatically reload the page at the precise moment tickets go on sale.

## Configuration

### Setting Sale Times

Edit the `sales` array in `reloader.js` to add or modify ticket sale times:

```javascript
const sales = [
	new Date("2025-11-08T11:00+01:00"),
	new Date("2025-11-17T15:10+01:00"),
	new Date("2025-11-17T20:00+01:00"),
]
```

Dates should be in ISO 8601 format with timezone offset.

### Testing Mode

The script automatically enters testing mode if the nearest sale is more than 3 minutes away. In this mode:
- The reload will trigger 45 seconds from now (instead of at a real sale time)
- The page **will not** actually reload
- You'll see a measurement of how accurate the timing would have been

To force testing mode, set all sale dates to be in the distant future.

### Timing Parameters

You can adjust these constants in the script:

```javascript
measure.interval: 5000  // How often to measure clock offset (ms)
// Checking interval: 20  // How often to check if it's time to reload (ms)
```

## Important Notes

⚠️ **Clock Accuracy**: If your system clock is off by more than 3 minutes from the server, this script won't help. Make sure your system time is properly synchronized (use NTP).

⚠️ **Keep Tab Active**: Browsers may throttle inactive tabs. Keep the tab visible and active for best results.

⚠️ **Network Connection**: Maintain a stable internet connection. The script needs to measure server time periodically.

⚠️ **Browser Compatibility**: This script uses modern browser APIs (`fetch`, `performance.now()`, etc.). Use a recent version of Chrome, Firefox, Edge, or Safari.

⚠️ **No Guarantees**: Even with perfect timing, tickets may sell out instantly. This script only helps you be there at the exact right moment.

## How to Test

1. Modify the `sales` array to set a date far in the future
2. Run the script in the console
3. You should see "Testing is active. This mode will not help you buy a ticket!"
4. Watch the console output to see timing measurements
5. After the test trigger time, check the "Delta" value to see how accurate the timing was

## Troubleshooting

**"Testing is active" when it shouldn't be**: Check that your sale dates are correct and within 3 minutes of the current time.

**Script stops working**: Browser console may have been cleared or the page may have been reloaded. Re-paste the script.

**High offset variance**: Your network connection may be unstable. Try a more stable connection.

**No output**: Make sure JavaScript is enabled and the console is open before running the script.

## License

Please refer to the original creator's repository for license information.

## Credits

Original script by [Lorenz Leutgeb](https://lorenz.leutgeb.xyz/) ([GitHub](https://github.com/lorenzleutgeb/))

Bug fixes and modifications by [malteish](https://github.com/malteish).
