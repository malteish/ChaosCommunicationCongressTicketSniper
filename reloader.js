function avgn(array, n) {
	// Fix 1: Sort numerically, not as strings
	// Fix 2: Don't mutate the original array
	let sorted = [...array].sort((a, b) => a - b);
	let len = Math.min(array.length, n)
	// Fix 3: Use len consistently
	return sorted.slice(0, len).reduce((a, b) => a + b) / len;
}

const now = Date.now();
console.log("Now:", new Date(now))

// Date of upcoming sales.
// https://events.ccc.de/congress/2025/infos/tickets.html
// To test that reloading really works, you can inject a date here.
const sales = [
	new Date("2025-11-08T11:00+01:00"),
	new Date("2025-11-17T15:10+01:00"),
	new Date("2025-11-17T20:00+01:00"),
]

// Automatically select testing if a sale is further out than three minutes.
// If your clock is off more than this duration from the server time,
// you'll be in trouble (no matter whether you use this script or not).
const THREE_MINUTES_IN_MILLISECONDS = 1000 * 60 * 3;

const sale = sales.find((candidate) => Math.abs(candidate - now) < THREE_MINUTES_IN_MILLISECONDS);

const target = sale === undefined ? new Date(now + 1000 * 45) : sale;

if (sale === undefined) {
	console.info("Testing is active. This mode will not help you buy a ticket!")
} else {
	console.info("Ready! Let's get that ticket!")
}

console.log("Target", target);

// `target` is the duration in ms relative to `performance.timeOrigin` at which
// to trigger reload, not accounting for any corrections.
const trigger = (performance.now() + (target.getTime() - now));

// We only use this for measurement.
const url = `${window.location.protocol}//${window.location.host}/`

let measure = {
	// `offset` is the duration in milliseconds we have to *add* to our
	// local clock reading to arrive at the remote clock
	// reading, *without* accounting for any delay on the
	// network.
	// Note that `offset` might be negative!
	offset: 0,

	// Measured offsets
	offsets: [],

	id: undefined,

	interval: 5000,
}

measure.id = setInterval(
	async () => {
		if (performance.now() > trigger - (2 * measure.interval)) {
			// Stop measuring shortly before the target, to not get
			// in the way.
			window.clearInterval(measure.id);
			console.info("Stopped measuring.")
			return;
		}

		let ours = Date.now();
		let response = await fetch(
			url,
			{
				cache: "no-store",
				method: "head",
			}
		);

		console.log("Ours:", ours)

		let header = response.headers.get("date");
		if (header !== null) {
			let theirs = Date.parse(header);
			console.log("Theirs:", theirs)

			let offset = theirs - ours;
			console.log("Current Offset", offset);

			measure.offsets.push(offset);
			measure.offset = avgn(measure.offsets, 5);
			console.log("All offsets:", measure.offsets);
			console.log("Avg. Offset", measure.offset);

			//console.log((performance.now() - (trigger - measure.offset)) / 1000)
		}
	},
	measure.interval /* [ms] … Measuring interval. */,
)

const handle = sale === undefined
	? async () => {
		if (performance.now() > trigger - measure.offset/* + measure.roundtrip*/) {
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
			// Fix 4: Declare variable properly (was missing 'let')
			let delta = theirs - target;
			console.log("Delta:", delta)
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
