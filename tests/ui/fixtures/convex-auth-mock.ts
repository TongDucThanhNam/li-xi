// Fixture stub for @convex-dev/auth/react: the workspace layout's logout
// hook only needs a callable signOut. The real auth flow is covered by the
// live-browser acceptance pass, not by these synthetic fixtures.
export function useAuthActions() {
	return {
		signOut: async () => {},
	};
}
