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
	learnedPhase: null, // Where in our local second the server's second occurs
	id: undefined,
	interval: 5000,
	burstStartOffset: 50, // Start 50ms before predicted edge, will adapt
}

// Edge detection: Detect when server second changes using burst sampling
async function detectEdge(predictedPhase = null) {
	console.log("🔍 Detecting second edge..." + (predictedPhase !== null ? ` (predicted phase: ${predictedPhase}ms, starting ${measure.burstStartOffset}ms early)` : ""));

	let previousSecond = null;
	let attempts = 0;
	const maxAttempts = 100;
	let samplesBeforeEdge = 0;

	// Phase 1: Initial search with moderate delays
	let burstStarted = false;

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
		let localPhase = ours % 1000;

		// Initialize previous second on first attempt
		if (previousSecond === null) {
			previousSecond = theirs;
			console.log(`    Initial check: Server=${theirs}, Local phase=${localPhase}ms`);

			// If we have a predicted phase, wait until burstStartOffset before it
			if (predictedPhase !== null) {
				const localMs = ours % 1000;
				let waitTime;

				if (predictedPhase > localMs + measure.burstStartOffset) {
					// Edge is later in this second
					waitTime = predictedPhase - localMs - measure.burstStartOffset;
				} else {
					// Edge is in the next second
					waitTime = (1000 - localMs) + predictedPhase - measure.burstStartOffset;
				}

				if (waitTime > 0 && waitTime < 900) {
					console.log(`⏭️  Waiting ${waitTime}ms to start burst...`);
					await new Promise(resolve => setTimeout(resolve, waitTime));
					continue;
				}
			}
		} else {
			// We're in burst mode - log each attempt
			if (!burstStarted) {
				console.log(`💥 Burst sampling started!`);
				burstStarted = true;
			}
			console.log(`    Burst attempt #${attempts}: Server=${theirs}, Local phase=${localPhase}ms, Server still at ${previousSecond}`);
			samplesBeforeEdge++;
		}

		// Check if we crossed a second boundary
		if (theirs !== previousSecond) {
			// We detected an edge! The server second just changed
			let offset = theirs - ours;
			console.log(`✓ Edge detected! Server jumped to ${theirs}, Local phase=${localPhase}ms, Offset=${offset}ms`);
			console.log(`   Got ${samplesBeforeEdge} samples before edge`);
			return { offset, localPhase, samplesBeforeEdge };
		}

		attempts++;

		// Phase 2: Once we know the server second, burst sample rapidly
		if (previousSecond !== null) {
			// Fire rapidly to catch the edge precisely
			// Use 5-10ms intervals to get multiple samples around the edge
			await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 5)); // 5-10ms bursts
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
	let edgeCount = 0;

	// Detect multiple edges for better accuracy, using learned phase
	for (let i = 0; i < 6; i++) { // Do 6, discard first
		let edgeResult = await detectEdge(predictedPhase);
		if (edgeResult !== null) {
			edgeCount++;

			// Skip the first measurement (often has higher latency)
			if (edgeCount === 1) {
				console.log(`⏭️  Discarding first measurement (${edgeResult.offset}ms) - often has connection overhead`);
			} else {
				measure.edgeMeasurements.push(edgeResult.offset);
				measure.offsets.push(edgeResult.offset);
			}

			// Learn the phase for next detection
			if (predictedPhase === null) {
				predictedPhase = edgeResult.localPhase;
				console.log(`📍 Learned phase: ${predictedPhase}ms - will target next edges around this time`);
			} else {
				// Refine prediction with running average
				predictedPhase = (predictedPhase + edgeResult.localPhase) / 2;
			}

			// Adapt burst start based on whether we got samples before edge
			if (edgeResult.samplesBeforeEdge === 0) {
				// We missed - start earlier next time
				measure.burstStartOffset += 30;
				console.log(`⚠️  Missed edge! Increasing burst start to ${measure.burstStartOffset}ms before predicted phase`);
			} else if (edgeResult.samplesBeforeEdge > 5) {
				// We're starting too early - can optimize
				measure.burstStartOffset = Math.max(20, measure.burstStartOffset - 10);
				console.log(`✓ Got ${edgeResult.samplesBeforeEdge} samples before edge. Adjusting burst start to ${measure.burstStartOffset}ms`);
			}
		}
	}

	if (measure.edgeMeasurements.length > 0) {
		// Use the best (smallest absolute value) edge measurements
		let rawOffset = avgn(measure.edgeMeasurements, Math.min(5, measure.edgeMeasurements.length));

		// Store the learned phase - this is where in our local second the server's second occurs
		// predictedPhase was refined throughout the detection process
		measure.learnedPhase = predictedPhase;

		// Add a safety buffer to ensure we're slightly late, not early
		// Being 50-100ms late is MUCH better than being any amount early!
		const SAFETY_BUFFER = 75; // ms - ensures we trigger AFTER sale starts

		// Calculate when to trigger based on the learned phase
		// If server's :00.000 occurs at our local :00.180, we should trigger at local phase 180ms + buffer
		measure.offset = -Math.abs(rawOffset) - SAFETY_BUFFER;

		console.log("✓ Initial sync complete!");
		console.log("Edge measurements:", measure.edgeMeasurements);
		console.log("Learned phase:", measure.learnedPhase, "ms (server second occurs at this local phase)");
		console.log("Raw offset:", rawOffset, "ms");
		console.log("Safety buffer:", SAFETY_BUFFER, "ms");
		console.log("Final offset (with safety buffer):", measure.offset, "ms");
		console.log("Optimal burst start:", measure.burstStartOffset, "ms before predicted phase");
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
				let rawOffset = avgn(measure.offsets, 5);

				// Apply safety buffer to ensure we're slightly late, not early
				const SAFETY_BUFFER = 75; // ms
				measure.offset = -Math.abs(rawOffset) - SAFETY_BUFFER;

				// Continue refining phase prediction
				if (predictedPhase !== null) {
					predictedPhase = (predictedPhase * 0.8 + edgeResult.localPhase * 0.2); // Weighted average
				}

				// Continue adapting burst timing
				if (edgeResult.samplesBeforeEdge === 0) {
					measure.burstStartOffset += 30;
					console.log(`⚠️  Missed edge! Increasing burst start to ${measure.burstStartOffset}ms`);
				} else if (edgeResult.samplesBeforeEdge > 5) {
					measure.burstStartOffset = Math.max(20, measure.burstStartOffset - 10);
					console.log(`✓ Got ${edgeResult.samplesBeforeEdge} samples before edge. Burst start now ${measure.burstStartOffset}ms`);
				}

				console.log("All offsets:", measure.offsets);
				console.log("Raw avg. offset:", rawOffset, "ms");
				console.log("Final offset (with 75ms safety):", measure.offset, "ms");
				console.log("Time to trigger:", ((trigger - measure.offset - performance.now()) / 1000).toFixed(2), "seconds");
			}
		},
		measure.interval,
	)
}

const handle = sale === undefined
	? async () => {
		// Check if we should trigger based on learned phase
		// When target is 14:00:00.000 and server's :00.000 occurs at our local :00.180,
		// we should trigger when our local clock reaches 14:00:00.180 + safety buffer
		const currentLocalPhase = Date.now() % 1000;
		const targetSecond = Math.floor(target.getTime() / 1000) * 1000;
		const currentSecond = Math.floor(Date.now() / 1000) * 1000;

		// Are we in or past the target second?
		if (currentSecond >= targetSecond) {
			// In target second - check if we've reached the learned phase + buffer
			const SAFETY_BUFFER = 75;
			const triggerPhase = (measure.learnedPhase + SAFETY_BUFFER) % 1000;

			if (currentLocalPhase >= triggerPhase || currentSecond > targetSecond) {
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
				console.log("=================================");
				console.log("FINAL ACCURACY TEST");
				if (delta >= 0 && delta < 1000) {
					console.log("✓ Hit the right second!");
				} else if (delta < 0) {
					console.log("✗ Too early - triggered before target second");
				} else {
					console.log("✗ Too late - triggered after target second");
				}
				console.log("=================================")
			}
		}
	}
	: () => {
		// Same logic for production mode
		const currentLocalPhase = Date.now() % 1000;
		const targetSecond = Math.floor(target.getTime() / 1000) * 1000;
		const currentSecond = Math.floor(Date.now() / 1000) * 1000;

		if (currentSecond >= targetSecond) {
			const SAFETY_BUFFER = 75;
			const triggerPhase = (measure.learnedPhase + SAFETY_BUFFER) % 1000;

			if (currentLocalPhase >= triggerPhase || currentSecond > targetSecond) {
				window.location.reload();
				window.clearInterval(reloader);
			}
		}
	}

let reloader = setInterval(
	handle,
	20 /* [ms] … Checking interval. */,
)

// Start the synchronization process
initialSync();
