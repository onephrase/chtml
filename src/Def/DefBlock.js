
/**
 * @imports
 */
import {
	Lexer
} from '@onephrase/jsen';
import _wrapped from '@onephrase/commons/str/wrapped.js';
import _unwrap from '@onephrase/commons/str/unwrap.js';
import Def from './Def.js';

/**
 * ---------------------------
 * Call class
 * ---------------------------
 */				

const DefBlock = class {

	/**
	 * @inheritdoc
	 */
	constructor(entries = []) {
		// We must add them through the door
		this.entries = [];
		entries.forEach(entry => this.add(entry));
	}
	
	/**
	 * Returns valid entries.
	 *
	 * @param bool		withDuplicates
	 * @param bool		withOverRidden
	 *
	 * @return array
	 */
	filter(withDuplicate = false, withOverRidden = false) {
		return this.entries.filter(entry => (!entry.isDuplicate || withDuplicate) && (!entry.overridden || withOverRidden));
	}
	 
	/**
	 * @inheritdoc
	 */
	toString(context = null, withDuplicate = false, withOverRidden = true) {
		return this.filter(withDuplicate, withOverRidden).map(def => def.toString(context)).join('; ') + ';';
	}
	
	/**
	 * Adds an entry to the list with overRiding resolved.
	 *
	 * @param object		entry
	 *
	 * @return this
	 */
	add(newDef) {
		if (!newDef.key || !newDef.value) {
			throw new Error('Def must contain a valid key and value!');
		}
		if (!(newDef instanceof Def)) {
			newDef = new Def(newDef.key, newDef.value, newDef.flag);
		}
		this.entries.forEach(existingDef => {
			if (existingDef.isDuplicate || existingDef.overridden) {
				return;
			}
			var key_a = existingDef.key.toString();
			var value_a = existingDef.value.toString();
			var value_aUnwrapped = _wrapped(value_a, '(', ')') ? _unwrap(value_a, '(', ')') : value_a;
			var key_b = newDef.key.toString();
			var value_b = newDef.value.toString();
			var value_bUnwrapped = _wrapped(value_b, '(', ')') ? _unwrap(value_b, '(', ')') : value_b;
			var incase_a = (existingDef.flag || '').toLowerCase() === '!incase';
			var important_a = (existingDef.flag || '').toLowerCase() === '!replace';
			var incase_b = (newDef.flag || '').toLowerCase() === '!incase';
			var important_b = (newDef.flag || '').toLowerCase() === '!replace';
			if (key_a === key_b) {
				if ((value_a === value_b || value_aUnwrapped === value_bUnwrapped) 
				&& (important_a === important_b || incase_a === incase_b)) {
					newDef.isDuplicate = true;
				} else if (important_b || incase_a) {
					existingDef.overridden = true;
				} else if ((important_a || incase_b)) {
					newDef.overridden = true;
				}
			}
		});
		this.entries.push(newDef);
		return this;
	}
	
	/**
	 * Parses an entire block of CHTML deinitions.
	 *
	 * @param string		expr
	 * @param object		opts
	 *
	 * @return DefBlock
	 */
	static parse(expr, opts = {}) {
		return new DefBlock(
			Lexer.split(expr, [';'], opts).filter(def => def.trim()).map(def => Def.parse(def.trim()))
		);
	}
};	

/**
 * @exports
 */
export default DefBlock;
