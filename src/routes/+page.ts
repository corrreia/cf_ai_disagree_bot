import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
	try {
		const parentData = await parent();
		return {
			user: parentData?.user ?? undefined,
		};
	} catch {
		return {
			user: undefined,
		};
	}
};

