type Point = {
	x: number;
	y: number;
};

const SHARD_COLORS = ["#8b0000", "#d4af37"] as const;
const SPARK_COLORS = ["#fff2c2", "#ffd700", "#ff6f00"] as const;

export const LEGENDARY_FX = {
	shardCount: 34,
	shardDurationMs: 1100,
	ringDurationMs: 900,
	sparkCount: 44,
	sparkDurationMs: 900,
} as const;

function animateAndRemove(
	element: HTMLElement,
	keyframes: Keyframe[],
	options: KeyframeAnimationOptions,
) {
	const animation = element.animate(keyframes, options);
	animation.onfinish = () => element.remove();
	animation.oncancel = () => element.remove();
}

export function createShards(host: HTMLElement, origin: Point) {
	for (let index = 0; index < LEGENDARY_FX.shardCount; index += 1) {
		const shard = document.createElement("div");
		shard.className = "md-shard";
		shard.style.left = `${origin.x}px`;
		shard.style.top = `${origin.y}px`;
		shard.style.backgroundColor = SHARD_COLORS[index % SHARD_COLORS.length];
		host.appendChild(shard);

		const angle = Math.random() * Math.PI * 2;
		const distance = 220 + Math.random() * 360;
		animateAndRemove(
			shard,
			[
				{ transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
				{
					transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) rotate(${Math.random() * 720}deg) scale(0)`,
					opacity: 0,
				},
			],
			{
				duration: LEGENDARY_FX.shardDurationMs + Math.random() * 300,
				easing: "cubic-bezier(0.16, 1, 0.3, 1)",
			},
		);
	}
}

function createRing(host: HTMLElement, origin: Point) {
	const ring = document.createElement("div");
	ring.className = "burst-ring";
	ring.style.left = `${origin.x}px`;
	ring.style.top = `${origin.y}px`;
	ring.style.color = "#ffd700";
	host.appendChild(ring);

	animateAndRemove(
		ring,
		[
			{ transform: "translate(-50%, -50%) scale(0.2)", opacity: 0.9 },
			{ transform: "translate(-50%, -50%) scale(18)", opacity: 0 },
		],
		{
			duration: LEGENDARY_FX.ringDurationMs,
			easing: "cubic-bezier(0.16, 1, 0.3, 1)",
		},
	);
}

function createSparkBurst(host: HTMLElement, origin: Point) {
	const spread = 380;
	for (let index = 0; index < LEGENDARY_FX.sparkCount; index += 1) {
		const spark = document.createElement("div");
		spark.className = "spark";
		spark.style.left = `${origin.x}px`;
		spark.style.top = `${origin.y}px`;
		spark.style.color = SPARK_COLORS[index % SPARK_COLORS.length];
		host.appendChild(spark);

		const angle = Math.random() * Math.PI * 2;
		const distance = spread * (0.4 + Math.random() * 0.6);
		animateAndRemove(
			spark,
			[
				{ transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
				{
					transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0)`,
					opacity: 0,
				},
			],
			{
				duration: LEGENDARY_FX.sparkDurationMs + Math.random() * 400,
				easing: "cubic-bezier(0.16, 1, 0.3, 1)",
			},
		);
	}
}

export function createLegendaryBurst(host: HTMLElement, origin: Point) {
	createRing(host, origin);
	createSparkBurst(host, origin);
}
