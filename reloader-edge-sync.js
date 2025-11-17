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

// Edge detection: Detect when server second changes using burst sampling
async function detectEdge(predictedPhase = null) {
	console.log("🔍 Detecting second edge..." + (predictedPhase !== null ? ` (predicted phase: ${predictedPhase}ms)` : ""));

	let previousSecond = null;
	let attempts = 0;
	const maxAttempts = 100;

	// Phase 1: Initial search with moderate delays
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

		// Initialize previous second on first attempt
		if (previousSecond === null) {
			previousSecond = theirs;

			// If we have a predicted phase, wait until just before it
			if (predictedPhase !== null) {
				const localMs = ours % 1000;
				let waitTime;

				if (predictedPhase > localMs) {
					// Edge is later in this second
					waitTime = predictedPhase - localMs - 150; // Start burst 150ms before predicted edge
				} else {
					// Edge is in the next second
					waitTime = (1000 - localMs) + predictedPhase - 150;
				}

				if (waitTime > 0 && waitTime < 900) {
					console.log(`⏭️  Waiting ${waitTime}ms to approach predicted edge...`);
					await new Promise(resolve => setTimeout(resolve, waitTime));
					continue;
				}
			}
		}

		// Check if we crossed a second boundary
		if (theirs !== previousSecond) {
			// We detected an edge! The server second just changed
			let offset = theirs - ours;
			let localPhase = ours % 1000; // Where in our local second did the edge occur?
			console.log(`✓ Edge detected! Server: ${theirs}, Ours: ${ours}, Offset: ${offset}ms, Local phase: ${localPhase}ms`);
			return { offset, localPhase };
		}

		attempts++;

		// Phase 2: Once we know the server second, burst sample rapidly
		if (previousSecond !== null) {
			// Fire rapidly to catch the edge precisely
			await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 10)); // 10-20ms bursts
		} else {
			// Initial search uses jittered delays
			const baseDelay = 50;
			const jitter = Math.random() * 100;
			await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
		}
	}

	console.warn("Could not detect edge within timeout");
	return null;
}

// Perform initial edge detection
async function initialSync() {
	console.log("⏱️  Performing initial synchronization...");

	let predictedPhase = null;

	// Detect multiple edges for better accuracy, using learned phase
	for (let i = 0; i < 5; i++) {
		let edgeResult = await detectEdge(predictedPhase);
		if (edgeResult !== null) {
			measure.edgeMeasurements.push(edgeResult.offset);
			measure.offsets.push(edgeResult.offset);

			// Learn the phase for next detection
			if (predictedPhase === null) {
				predictedPhase = edgeResult.localPhase;
				console.log(`📍 Learned phase: ${predictedPhase}ms - will target next edges around this time`);
			} else {
				// Refine prediction with running average
				predictedPhase = (predictedPhase + edgeResult.localPhase) / 2;
			}
		}
	}

	if (measure.edgeMeasurements.length > 0) {
		// Use the best (smallest absolute value) edge measurements
		measure.offset = avgn(measure.edgeMeasurements, Math.min(5, measure.edgeMeasurements.length));
		console.log("✓ Initial sync complete!");
		console.log("Edge measurements:", measure.edgeMeasurements);
		console.log("Initial offset:", measure.offset, "ms");
	} else {
		console.warn("⚠️  Edge detection failed, using fallback method");
	}

	// Start periodic measurements with learned phase
	startPeriodicMeasurements(predictedPhase);
}

function startPeriodicMeasurements(predictedPhase) {
	measure.id = setInterval(
		async () => {
			if (performance.now() > trigger - (2 * measure.interval)) {
				window.clearInterval(measure.id);
				console.info("Stopped measuring.");
				console.log("Final offset:", measure.offset, "ms");
				console.log("All measurements:", measure.offsets);
				return;
			}

			// Try to detect an edge using learned phase
			let edgeResult = await detectEdge(predictedPhase);

			if (edgeResult !== null) {
				measure.offsets.push(edgeResult.offset);
				measure.offset = avgn(measure.offsets, 5);

				// Continue refining phase prediction
				if (predictedPhase !== null) {
					predictedPhase = (predictedPhase * 0.8 + edgeResult.localPhase * 0.2); // Weighted average
				}

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
