function avgn(array, n) {
	// Sort by absolute value to get measurements closest to zero (best edge detections)
	let sorted = [...array].sort((a, b) => Math.abs(a) - Math.abs(b));
	let len = Math.min(array.length, n);
	return sorted.slice(0, len).reduce((a, b) => a + b) / len;
}

const now = Date.now();
console.log("Now:", new Date(now))

// Date of upcoming sales.
const sales = [
	new Date("2025-11-08T11:00+01:00"),
	new Date("2025-11-17T20:00+01:00"),
]

const THREE_MINUTES_IN_MILLISECONDS = 1000 * 60 * 3;
const sale = sales.find((candidate) => Math.abs(candidate - now) < THREE_MINUTES_IN_MILLISECONDS);
const target = sale === undefined ? new Date(now + 1000 * 45) : sale;

if (sale === undefined) {
	console.info("Testing is active. This mode will not help you buy a ticket!")
} else {
	console.info("Ready! Let's get that ticket!")
}

console.log("Target", target);

const trigger = (performance.now() + (target.getTime() - now));
const url = `${window.location.protocol}//${window.location.host}/`

let measure = {
	offset: 0,
	offsets: [],
	lastServerSecond: null,
	edgeMeasurements: [],
	id: undefined,
	interval: 5000,
}

// Edge detection: Detect when server second changes
async function detectEdge() {
	console.log("🔍 Detecting second edge...");

	let previousSecond = null;
	let attempts = 0;
	const maxAttempts = 50; // Try for ~5 seconds max

	while (attempts < maxAttempts) {
		let ours = Date.now();
		let response = await fetch(url, {
			cache: "no-store",
			method: "head",
		});

		let header = response.headers.get("date");
		if (header === null) {
			console.warn("No date header received");
			return null;
		}

		let theirs = Date.parse(header);

		// Check if we crossed a second boundary
		if (previousSecond !== null && theirs !== previousSecond) {
			// We detected an edge! The server second just changed
			let offset = theirs - ours;
			console.log(`✓ Edge detected! Server: ${theirs}, Ours: ${ours}, Offset: ${offset}ms`);
			return offset;
		}

		previousSecond = theirs;
		attempts++;

		// Wait with jitter to sample at different phases of the server's second
		// This increases chances of catching the edge very close to the actual boundary
		const baseDelay = 50;  // Base delay in ms
		const jitter = Math.random() * 100;  // Random jitter 0-100ms
		const delay = baseDelay + jitter;
		await new Promise(resolve => setTimeout(resolve, delay));
	}

	console.warn("Could not detect edge within timeout");
	return null;
}

// Perform initial edge detection
async function initialSync() {
	console.log("⏱️  Performing initial synchronization...");

	// Detect multiple edges for better accuracy
	for (let i = 0; i < 3; i++) {
		let edgeOffset = await detectEdge();
		if (edgeOffset !== null) {
			measure.edgeMeasurements.push(edgeOffset);
		}
	}

	if (measure.edgeMeasurements.length > 0) {
		// Use the best (smallest) edge measurements
		measure.offset = avgn(measure.edgeMeasurements, Math.min(3, measure.edgeMeasurements.length));
		measure.offsets = [...measure.edgeMeasurements];
		console.log("✓ Initial sync complete!");
		console.log("Edge measurements:", measure.edgeMeasurements);
		console.log("Initial offset:", measure.offset, "ms");
	} else {
		console.warn("⚠️  Edge detection failed, using fallback method");
	}

	// Start periodic measurements
	startPeriodicMeasurements();
}

function startPeriodicMeasurements() {
	measure.id = setInterval(
		async () => {
			if (performance.now() > trigger - (2 * measure.interval)) {
				window.clearInterval(measure.id);
				console.info("Stopped measuring.");
				console.log("Final offset:", measure.offset, "ms");
				console.log("All measurements:", measure.offsets);
				return;
			}

			// Try to detect an edge
			let edgeOffset = await detectEdge();

			if (edgeOffset !== null) {
				measure.offsets.push(edgeOffset);
				measure.offset = avgn(measure.offsets, 5);
				console.log("All offsets:", measure.offsets);
				console.log("Avg. Offset:", measure.offset, "ms");
				console.log("Time to trigger:", ((trigger - measure.offset - performance.now()) / 1000).toFixed(2), "seconds");
			}
		},
		measure.interval,
	)
}

const handle = sale === undefined
	? async () => {
		if (performance.now() > trigger - measure.offset) {
			window.clearInterval(reloader);
			let response = await fetch(
				url,
				{
					cache: "no-store",
					method: "head",
				}
			);

			let header = response.headers.get("date");
			console.assert(header !== null)

			let theirs = Date.parse(header);
			let delta = theirs - target;
			console.log("Delta:", delta, "ms")
		}
	}
	: () => {
		if (performance.now() > trigger - measure.offset) {
			window.location.reload();
			window.clearInterval(reloader);
		}
	}

let reloader = setInterval(
	handle,
	20 /* [ms] … Checking interval. */,
)

// Start the synchronization process
initialSync();
