
/**
 * @imports
 */
import Chtml from './Chtml.js';
import ChtmlCore from './ChtmlCore.js';
import Schema from './Schema.js';
import Matrix from './Def/Matrix.js';

/**
 * Configure CHTM with a global context.
 * Here for server-side usage, we will be mocking
 * the window object.
 */
ChtmlCore.ctxt = {
	document:{},
};

/**
 * Create bundles from filesystem.
 * Configure CHTM with server-based bundles.
 */
ChtmlCore.bundles = {};

/**
 * @exports
 */
export {
	ChtmlCore,
	Schema,
	Matrix,
};
export default Chtml;