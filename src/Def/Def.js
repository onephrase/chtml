
/**
 * @imports
 */
import {
	_last
} from '@onephrase/commons/src/Arr.js';
import {
	_copy
} from '@onephrase/commons/src/Obj.js';
import {
	Lexer
} from '@onephrase/jsen';

/**
 * ---------------------------
 * Call class
 * ---------------------------
 */				

const Def = class {

	/**
	 * @inheritdoc
	 */
	constructor(key, value, flag = null) {
		this.key = key;
		this.value = value;
		this.flag = flag;
	}
	 
	/**
	 * @inheritdoc
	 */
	toString(context = null) {
		return this.key + ': ' + this.value + (this.flag ? ' ' + this.flag : '');
	}
	
	/**
	 * Parses an entire block of CHTML deinitions.
	 *
	 * @param string		expr
	 * @param object		opts
	 *
	 * @return Def
	 */
	static parse(expr, opts = {}) {
		if (expr) {
			var _opts = _copy(opts);
			_opts.limit = 1;
			var defSplit = Lexer.split(expr, [':'], _opts);
			if (defSplit.length < 2) {
				throw new Error('Malformed def: ' + expr);
			}
			var key = defSplit.shift().trim();
			var value, flag, vf = Lexer.split(defSplit.shift().trim(), [' '], opts);
			if (vf.length > 1) {
				if (Def.flags.includes(_last(vf).trim().toLowerCase())) {
					flag = vf.pop().trim().toLowerCase();
				}
			}
			value = vf.join(' ');
			return new Def(key, value, flag);
		}
	}
};	

/**
 * @exports
 */
Def.flags = ['!replace', '!incase',];

/**
 * @exports
 */
export default Def;
