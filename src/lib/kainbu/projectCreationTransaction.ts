/**
 * Runs the post-project-create phase as one compensatable transaction.
 * The project row is deliberately created before this helper so the rollback
 * scope is always the one freshly-created PocketBase project.
 */
export const runProjectInitialization = async <T>(
	initialize: () => Promise<T>,
	rollback: () => Promise<void>
): Promise<T> => {
	try {
		return await initialize();
	} catch (error) {
		try {
			await rollback();
		} catch (rollbackError) {
			throw new AggregateError([error, rollbackError], 'Project creation and rollback failed');
		}
		throw error;
	}
};
