
/**
 * @imports
 */
import {
	Lexer
} from '@onephrase/jsen';
import {
	_copy,
	_each
} from '@onephrase/commons/src/Obj.js';
import {
	_isArray,
	_isObject
} from '@onephrase/commons/src/Js.js';
import {
	_unwrap
} from '@onephrase/commons/src/Str.js';
import DefBlock from './DefBlock.js';

/**
 * ---------------------------
 * Call class
 * ---------------------------
 */				

const DefSheet = class {

	/**
	 * @inheritdoc
	 */
	constructor(block = {}) {
		this.block = {};
		this.apply(block);
	}
	 
	/**
	 * @inheritdoc
	 */
	toString(context = null, withDuplicate = false, withOverRidden = true) {
		var str = [];
		_each(this.block, (type, defBlock) => {
			str.push('@' + type);
			str.push('{' + defBlock.toString(context, withDuplicate, withOverRidden) + '}');
		});
		return str.join(' ');
	}
	 
	/**
	 * Merges a DefSheet instance or a block of entries into the current instance.
	 *
	 * @param array|DefSheet	defSheet
	 *
	 * @return this
	 */
	apply(defSheet) {
		var block = defSheet;
		if (defSheet instanceof DefSheet) {
			block = defSheet.block;
		} else if (!_isObject(defSheet)) {
			throw new Error('Argument #1 must only be an object or an instance of ./DefSheet!');
		}
		_each(block, (section, defBlock) => {
			this.applyTo(section, defBlock);
		});
		return this;
	}
	 
	/**
	 * Adds entries to the list of entries for the given type.
	 *
	 * @param string			section
	 * @param array|DefBlock	defBlock
	 *
	 * @return this
	 */
	applyTo(section, defBlock) {
		var entries = defBlock;
		if (defBlock instanceof DefBlock) {
			entries = defBlock.entries;
		} else if (!_isArray(defBlock)) {
			throw new Error('Argument #1 must only be an array or an instance of ./DefBlock!');
		}
		if (!this.block[section]) {
			this.block[section] = new DefBlock;
		}
		entries.forEach(entry => this.block[section].add(_copy(entry)));
		return this;
	}
	
	/**
	 * Parses an entire block of CHTML deinitions.
	 *
	 * @param string		expr
	 * @param object		opts
	 *
	 * @return object
	 */
	static parse(expr, opts = {}) {
		var splits = Lexer.split(expr, [], opts);
		var type, expr, defBlock, block = {};
		while ((type = splits.shift()) && (defBlock = splits.shift())) {
			block[type.trim().toLowerCase().substr(1)] = DefBlock.parse(_unwrap(defBlock.trim(), '{', '}'), opts);
		}
		return new DefSheet(block);
	}
};	

/**
 * @exports
 */
export default DefSheet;
