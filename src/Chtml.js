
/**
 * @imports
 */
import _mixin from '@onephrase/commons/js/mixin.js';
import _isString from '@onephrase/commons/js/isString.js';
import _isNumber from '@onephrase/commons/js/isNumber.js';
import _isNumeric from '@onephrase/commons/js/isNumeric.js';
import _isFunction from '@onephrase/commons/js/isFunction.js';
import _isUndefined from '@onephrase/commons/js/isUndefined.js';
import _isObservable from '@onephrase/commons/js/isObservable.js';
import _getProxyTarget from '@onephrase/commons/js/getProxyTarget.js';
import _isProxy from '@onephrase/commons/js/isProxy.js';
import _all from '@onephrase/commons/arr/all.js';
import _following from '@onephrase/commons/arr/following.js';
import _before from '@onephrase/commons/str/before.js';
import _beforeLast from '@onephrase/commons/str/beforeLast.js';
import _closest from '@onephrase/commons/num/closest.js';
import _inherit from '@onephrase/commons/obj/inherit.js';
import ChtmlCore from './ChtmlCore.js';

/**
 * ---------------------------
 * The Chtml class
 push, observe bare class, return proxy if, 
 * ---------------------------
 */				

const Chtml = class extends ChtmlCore {

	/**
	 * Constructs a new Chtml and optionally returns a proxy wrapper.
	 *
	 * @param document|HTMLElement	el
	 * @param object				params
	 *
	 * @return new Proxy
	 */
	constructor(el, params = {}) {
		super(el, _inherit({}, params, Chtml.params));
		// -----------------------------
		// OBSERVABILITY
		// -----------------------------
		// Bind populable context
		this.observe(this.$.params.dataKey, (context, _context) => {
			if (this.$.ns.subnamespace && !_isString(context) && !_isNumber(context) && !_isUndefined(context)) {
				// Initial Sync...
				this.populate(context, this.$.ns.subnamespace, this.$.params.itemCallback);
				// Reactive Sync?
				if (_isObservable(context)) {
					context.observe(changes => {
						this.populate(context, this.$.ns.subnamespace, this.$.params.itemCallback, Object.keys(changes));
					});
				}
			}
		});
	}
	
	/**
	 * Binds a (reactive) context object or logical object to the instance.
	 *
	 * @param object 		context
	 *
	 * @return this
	 */
	bind(context) {
		this.set(this.$.params.dataKey, context);
		return this;
	}
	
	/**
	 * Binds a (reactive) list context to the instance.
	 * Childnodes will be automatically created/removed per key.
	 *
	 * @param array 		listContext
	 * @param string 		subnamespace
	 * @param function 		itemCallback
	 * @param array 		onlyKeys
	 *
	 * @return this
	 */
	populate(listContext, subnamespace, itemCallback = null, onlyKeys = []) {
		if (_isObservable(listContext) && !_isProxy(listContext)) {
			listContext = listContext.proxy();
		}
		(arguments.length > 3 ? onlyKeys : Object.keys(listContext)).forEach(k => {
			k = _isNumeric(k) ? parseInt(k) : k;
			var item = this.has(k) ? this.get(k) : null;
			if (!_isUndefined(listContext[k])) {
				var isNewItem = false;
				if (!item) {
					var itemNamespaceArray = subnamespace.split('//');
					// Create a namespace hash...
					itemNamespaceArray[0] += '/' + k;
					var itemEl = Chtml.import(itemNamespaceArray.join('//'));
					if (itemEl) {
						var following = _following(Object.keys(listContext), k + ''/*numeric k needs this*/, true/*length*/)
							.reduce((closest, _k) => closest || (this.has(_k) ? this.get(_k) : null), null);
						if (following) {
							following.el.before(itemEl);
						} else {
							this.el.append(itemEl);
						}
						item = this.createNode(k, itemEl);
						isNewItem = true;
					}
				}
				if (item) {
					if (_isFunction(itemCallback)) {
						itemCallback(item, listContext[k], k, isNewItem);
					} else {
						item.bind(listContext[k]);
					}
				}
			} else if (item) {
				if (_isFunction(itemCallback)) {
					var unbindReturn = itemCallback(item, false, k);
					if (('Promise' in ChtmlCore.ctxt) && unbindReturn instanceof ChtmlCore.ctxt.Promise) {
						unbindReturn.then(() => {
							item.el.remove();
						}).catch(() => {
							item.el.remove();
						});
					} else {
						item.el.remove();
					}
				} else {
					item.free();
					item.el.remove();
				}
			}
		});
	}
	
	/**
	 * -------------------
	 * INSTANCE-RELATED METHODS
	 * -------------------
	 */

	/**
	 * Creates a Chtml over a root resolved from definition or markup string.
	 *
	 * @param string|document|HTMLElement	input
	 * @param object						params
	 * @param bool							resolveInheritance
	 * @param object						Static
	 *
	 * @return Chtml
	 */
	static from(input, params = {}, resolveInheritance = true, Static = Chtml) {
		// -----------------------------
		// Resolve element from input
		// -----------------------------
		var el = input;
		if (_isString(input) && !input.trim().startsWith('<') && input.indexOf('/') !== -1) {
			if (!ChtmlCore.bundles || !(el = Chtml.import(_before(input, '//')))) {
				throw new Error('No element found on the namespace "' + input + '"!');
			}
		} else {
			if (_isString(input)) {
				if (!(el = ChtmlCore.toElement(input))) {
					throw new Error('Could not resolve the string "' +input + '" to an element!');
				}
			}
			if (resolveInheritance && ChtmlCore.bundles) {
				var ns, superNs, superEl, isImport = el.matches(ChtmlCore.elementMap.import);
				if ((ns = _before(el.getAttribute(ChtmlCore.attributeMap.ns) || '', '//'))
				// The entire namespace is used for elements of type import.
				// The supernamespace is used for normal elements
				&& ((isImport && (superNs = ns)) || (superNs = _beforeLast(ns, '/')) && superNs.indexOf('/') > -1)
				&& (superEl = Chtml.import(superNs))) {
					var _el = el;
					el = ChtmlCore.recompose(el, superEl);
					if (isImport) {
						_el.replaceWith(el);
					}
				} else if (ns) {
					console.warn('Namespace resolution failed: ' + ns);
				}
			}
		}
		return new Static(el, params);
	}
	
	/**
	 * Imports a module from bundles.
	 *
	 * @param string						namespace
	 *
	 * @return HTMLElement
	 */
	static import(namespace) {
		return ChtmlCore.bundles.find(namespace);
	}
};

/**
 * @var object
 */
Chtml.params = {
	diff: true,
	dataKey: '$',
	drilldown: false,
	nodeCallback: null,
	componentCallback: Chtml.from,
	observeOnly: false,
}

/**
 * @exports
 */
export default Chtml;
