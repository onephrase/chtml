
/**
 * @imports
 */
import {
	_isArray,
	_isString,
	_isFunction,
	_isProxy,
	_getProxyTarget
} from '@onephrase/commons/src/Js.js';
import {
	_from as _arr_from,
	_unique
} from '@onephrase/commons/src/Arr.js';
import {
	_even,
	_each,
	_copy
} from '@onephrase/commons/src/Obj.js';
import {
	_before,
	_after
} from '@onephrase/commons/src/Str.js';
import Jsen, {
	ArgumentsInterface,
	CallInterface,
	ReferenceInterface,
	Arguments,
	Lexer
} from '@onephrase/jsen';
import Observable from '@onephrase/observable';
import Matrix from './Def/Matrix.js';
import DefSheet from './Def/DefSheet.js';
import DefBlock from './Def/DefBlock.js';
import Schema from './Schema.js';

/**
 * ---------------------------
 * The Chtml class
 push, observe bare class, return proxy if, 
 * ---------------------------
 */				

const ChtmlCore = class extends Observable {

	/**
	 * Initializes the new Chtml instance.
	 *
	 * @param document|HTMLElement	el
	 * @param object				params
	 *
	 * @return void
	 */
	constructor(el, params = {}) {
		super({}, params);
		// -----------------------------
		// ROOT RESOLUTION:
		// -----------------------------
		this.root = this.el = el;
		if (el.nodeName === '#document') {
			this.el = el.querySelector('html');
		} else if (!(el instanceof HTMLElement)) {
			throw new Error('Argument #1 must be instanceof of HTMLElement or the document object!');
		}
		// -----------------------------
		// BINDINGS/DIRECTIVES
		// -----------------------------
		// The parsed namespace ($ns)
		this.$.ns = ChtmlCore.parseNamespace(this.el);
		// The parsed Cascaded Definition Sheet ($defs)
		this.$.defs = ChtmlCore.parseCascadedDefSheet(this.el);
		// Initialize...
		this.init();
	}
	
	/**
	 * Executes one-off initialization directives.
	 *
	 * Then executes reactive bindings and keeps them bound.
	 *
	 * @return this
	 */
	init() {
		// -----------------------
		// Free the instance first...
		this.free(false);
		// -----------------------
		// One-off init
		this.getCpsBlock('init', true/*asDirectives*/).forEach(directive => directive.eval(this));
		// -----------------------
		// Reactive bindings
		this.$.bindingsListeners = [];
		// Apply bindings...
		var stringifyEach = list => _unique(list.map(expr => _before(_before(expr.toString(), '['), '(')));
		this.getCpsBlock('bindings', true/*asDirectives*/).forEach(binding => {
			if (!this.$.params.observeOnly) {
				binding.eval(this, this.jsenGetter());
			}
			// We'll execute binding on the appriopriate changes
			var listenerObj = this.observe(stringifyEach(binding.meta.vars), (newState, oldState, params) => {
				// Next eval() should be triggered by only the changes in the vars that participated in this eval()
				var evalReturn = binding.eval(this, this.jsenGetter());
				// If the result of this evaluation is false,
				// e.stopPropagation will be called and subsequent expressions
				// will not be evaluated. So we must not allow false to be returned.
				// All expressions are meant to be evaluated in parallel, independent of each other.
				if (evalReturn !== false) {
					return evalReturn;
				}
			}, {diff: this.$.params.diff});
			this.$.bindingsListeners.push(listenerObj);
		});
		return this;
	}
	
	/**
	 * Frees the instance of either observed bindings
	 * or entire available listeners.
	 *
	 * @param bool					all
	 *
	 * @return this
	 */
	free(all = true) {
		if (all) {
			// Remove all available listeners
			super.removeListener();
		} else if (this.$.bindingsListeners) {
			// Remove all observed bindings
			this.$.bindingsListeners.forEach(listener => listener.remove());
			this.$.bindingsListeners.splice();
		}
		return this;
	}
	
	/**
	 * Clones the instance using a serialize/deserialize strategy.
	 *
	 * @param bool	 		cleanCopy
	 *
	 * @return ChtmlInterface
	 */
	clone(cleanCopy = true) {
		if (!_isFunction(this.$.params.componentCallback)) {
			throw new Error('The params.componentCallback function is required!');
		}
		var el = this.el.cloneNode(true);
		// -------------------------------
		// We'll remove all aprsable components of the element
		// as we already have the most accurate available
		// -------------------------------
		var attrCache = {};
		[ChtmlCore.attributeMap.related, ChtmlCore.attributeMap.bindings].forEach(type => {
			var attrValue;
			if (attrValue = el.getAttribute(type)) {
				attrCache.type = attrValue;
				el.removeAttribute(type);
			}
		});
		var dataBlockScript;
		if (dataBlockScript = _arr_from(el.children).filter(node => node.matches(ChtmlCore.elementMap.defsheet))[0]) {
			dataBlockScript.remove();
		}
		// -------------------------------
		// Instantiate now...
		// -------------------------------
		var instance = this.$.params.componentCallback(el, this.$.params, false/*resolveInheritance*/);
		var _instance = _isProxy(instance) ? _getProxyTarget(instance) : instance;
		// Serialize/deserialize definitions
		_instance.$defs = DefSheet.parse(this.$.defs.toString(null/*context*/, !cleanCopy/*withDuplicate*/, true/*withOverRidden*/));
		// -------------------------------
		// Restore parsable components of the element just for the records
		// -------------------------------
		_each(attrCache, (type, attrValue) => {
			el.setAttribute(type, attrValue);
		});
		if (dataBlockScript) {
			el.prepend(dataBlockScript);
		}
		return instance;
	}
	
	/**
	 * Evalutes the bindings for the component;
	 * caches the result for subsequent calls.
	 *
	 * @param string		key
	 * @param bool			asDirectives
	 *
	 * @return array
	 */
	getCpsBlock(key, asDirectives = false) {
		var cpsBlockDefs = this.$.defs.block[key] ? this.$.defs.block[key].filter() : [];
		if (asDirectives) {
			var directives = [];
			cpsBlockDefs.forEach(def => {
				var argsExpr = (this.$.params.chainableDirectives === false || !def.value.trim().startsWith('(') ? [def.value] : Lexer.split(def.value, ['.']))
					.map(expr => Jsen.parse(expr, [Arguments], {assert:false}) || Jsen.parse(expr));
				if (argsExpr.length !== argsExpr.filter(a => a).length) {
					this.error('Malformed argument in the CPS expression: ' + def.toString());
					return;
				}
				var directive, _directive = def.key + (argsExpr.length > 1 || argsExpr[0] instanceof ArgumentsInterface ? argsExpr.join('.') : '(' + argsExpr[0].toString() + ')');
				if (!(directive = Jsen.parse(_directive, null, {explain: this.$.params.explainJsen}))) {
					this.error('Malformed CPS expression: ' + def.toString());
					return;
				}
				directives.push(directive);
			});
			return directives;
		}
		return cpsBlockDefs;
	}

	/**
	 * Attempts to resolve a node as related node.
	 *
	 * @param string				requestNodeName
	 *
	 * @return HTMLElement|ChtmlInterface
	 */
	getRelatedNode(requestNodeName) {
		var computeQuery, node, vars = [];
		if (!this.computedRelated) {
			this.computedRelated = {};
			this.getCpsBlock('related', false/*asDirectives*/).forEach(entry => {
				this.computedRelated[entry.key] = Jsen.parse(entry.value);
			});
		}
		if ((computeQuery = this.computedRelated[requestNodeName]) 
		&& (node = computeQuery.eval(this, this.jsenGetter(vars)))) {
			if (_isFunction(node)) {
				node = node(this.el, requestNodeName);
				if (!_isString(node) && !(node instanceof HTMLElement)) {
					throw new Error('The callback for node "' + requestNodeName + '" returned an invalid type.');
				}
			}
			if (_isString(node)) {
				// Markup or plain selector string....
				node = ChtmlCore.toElement(node);
			}
			if (!(node instanceof HTMLElement)) {
				throw new Error('"' + requestNodeName + '" could not be resolved to a valid node instance.');
			}
			return node;
		}
	}
	
	/**
	 * Attempts to resolve a node from explicit model.
	 *
	 * @param string				requestNodeName
	 *
	 * @return HTMLElement
	 */
	getExplicitNode(requestNodeName) {
		// If given a rolecase, we can perform a query if we understand the semantics.
		if ((this.$.roles && this.$.roles.length)
		|| (this.$.roles = (this.el.getAttribute(ChtmlCore.attributeMap.superrole) || '').replace('  ', ' ').split(' ')).length) {
			var roles = this.$.params.rolecase ? [this.$.params.rolecase] : this.$.roles;
			// Find matches...
			return roles.reduce((matchedNode, role) => {
				if (!matchedNode) {
					var closestSuperSelector = '[' + ChtmlCore.attributeMap.superrole + '~="' + role + '"]';
					var nodeSelector = '[' + ChtmlCore.attributeMap.subrole + '~="' + role + '-' + requestNodeName + '"]';
					var closestSuper, _matchedNode;
					if ((_matchedNode = (this.el.shadowRoot || this.el).querySelector(nodeSelector))
					// If this.el has a shadowRoot, we don't expect _matchedNode to be able to find is superRole element.
					// If it finds one, then its not for the curren superRole element.
					&& ((this.el.shadowRoot && !(_matchedNode.parentNode.closest && _matchedNode.parentNode.closest(closestSuperSelector)))
					// _matchedNode must find this.el as its superRole element to qualify.
						|| (!this.el.shadowRoot && _matchedNode.parentNode && (closestSuper = _matchedNode.parentNode.closest(closestSuperSelector)) && closestSuper.isSameNode(this.el))
					)) {
						matchedNode = _matchedNode;
					}
				}
				return matchedNode;
			}, null);
		}
	}
	
	/**
	 * Attempts to resolve a node from implicit model.
	 *
	 * @param string				requestNodeName
	 *
	 * @return HTMLElement|array
	 */
	getImplicitNode(requestNodeName) {
		if (requestNodeName.match(/[^a-zA-Z0-9\-]/)) {
			return;
		}
		// Use schema...
		var nodeSchema, nodeSelector = [];
		var tries = [];
		if (ChtmlCore.schema.aria[requestNodeName]) {
			tries.push({
				schema: ChtmlCore.schema.aria[requestNodeName],
				selector: ['[role="' + requestNodeName + '"]'],
			});
		} else {
			tries.push({
				schema: ChtmlCore.schema.std[requestNodeName] || ChtmlCore.schema.aria[requestNodeName],
				selector: [requestNodeName, '[role="' + requestNodeName + '"]'],
			});
		}
		_each(ChtmlCore.schema.std, (tagname, schema) => {
			if (schema.implicitRole === requestNodeName) {
				tries.push({
					schema: schema,
					selector: [tagname],
				});
			}
		});
		var matches = null;
		tries.forEach(trie => {
			(this.el.shadowRoot || this.el).querySelectorAll(trie.selector.join(',')).forEach(node => {
				if (ChtmlCore.schema.assertNodeBelongsInScopeAs(this.el, node, trie.schema)) {
					if (trie.schema && trie.schema.singleton) {
						matches = node;
					} else if (!matches || _isArray(matches)) {
						matches = matches || [];
						matches.push(node);
					}
				}
			});
		});
		return matches;
	}
	
	/**
	 * Makes a node object following the nodeCallback rules
	 * for the instance.
	 *
	 * @param string|int	 nodeName
	 * @param mixed			 node
	 *
	 * @return mixed
	 */
	createNode(nodeName, node) {
		var _node = node;
		if (this.$.params.drilldown) {
			if (node === this.root || node === this.el) {
				node = this;
			} else if (node) {
				if (!_isFunction(this.$.params.componentCallback)) {
					throw new Error('The params.componentCallback function is required!');
				}
				var params = _copy(this.$.params);
				params.alias = nodeName;
				node = _isArray(node) 
					? node.map(node => this.$.params.componentCallback(node, params, true/*resolveInheritance*/)) 
					: this.$.params.componentCallback(node, params, true/*resolveInheritance*/);
			}
		} else if (_isFunction(this.$.params.nodeCallback)) {
			node = _isArray(node) 
				? node.map(node => this.$.params.nodeCallback(node)) 
				: this.$.params.nodeCallback(node);
		}
		this.set(nodeName, node);
		if (_node && _node !== this.root && _node !== this.el && !_isArray(_node)) {
			ChtmlCore.disconnectedCallback(_node, () => {
				this.del(nodeName);
			});
		}
		return node;
		
	}
	
	/**
	 * Finds a node by name; caches result.
	 *
	 * @param string 		nodeName
	 *
	 * @return mixed
	 */
	get(nodeName) {
		// ----------------------
		var asOwnMethod = this.asOwnMethod(nodeName);
		if (asOwnMethod) {
			return asOwnMethod;
		}
		// ----------------------
		var node;
		if (nodeName === '_' || nodeName === '__') {
			return super.get(nodeName);
		}
		if ((nodeName === 'root' && (node = this.root)) 
		|| (nodeName === 'el' && (node = this.el))) {
			return _isFunction(this.$.params.nodeCallback) 
				? this.$.params.nodeCallback(node) 
				: node;
		}
		if (!(nodeName in this.$.state)) {
			if ((node = this.getRelatedNode(nodeName))
			|| (!this.$.params.implicitOnly && (node = this.getExplicitNode(nodeName)))
			|| (!this.$.params.explicitOnly && (node = this.getImplicitNode(nodeName)))) {
				this.createNode(nodeName, node);
			}
		}
		return this.$.state[nodeName];
	}
	
	/**
	 * -------------------
	 * UTILITY METHODS
	 * -------------------
	 */
	
	/**
	 * Parses an element's CHTML namespace.
	 * This explains how an element's namespace is used in CHTML.
	 *
	 * @param HTMLElement					el
	 *
	 * @return object
	 */
	static parseNamespace(el) {
		var namespaceParse = {roadmap: el.getAttribute(ChtmlCore.attributeMap.ns)};
		if (namespaceParse.roadmap) {
			namespaceParse.namespace = _before(namespaceParse.roadmap, '//');
			namespaceParse.subnamespace = _after(namespaceParse.roadmap, '//');
			// In case this is the /// spot...
			if (namespaceParse.subnamespace.startsWith('/')) {
				namespaceParse.subnamespace = _after(namespaceParse.subnamespace, '/');
			}
			if (namespaceParse.subnamespace.endsWith('//') && namespaceParse.subnamespace.indexOf('///') === -1) {
				namespaceParse.subnamespace = namespaceParse.subnamespace + namespaceParse.namespace + '//';
			}
		}
		return namespaceParse;
	}
	
	/**
	 * Parses an element's CHTML definitions (related, bindings)
	 * both from attributes and from an embedded script data block.
	 *
	 * Where both attributes and data block are set, definitions in attributes inherit from those in data block.
	 *
	 * @param HTMLElement					el
	 *
	 * @return DefSheet
	 */
	static parseCascadedDefSheet(el) {
		var dataBlockScript, defsheet;
		if (!(dataBlockScript = _arr_from(el.children).filter(node => node.matches(ChtmlCore.elementMap.defsheet))[0])
		|| !(defsheet = DefSheet.parse((dataBlockScript.textContent || '').trim()))) {
			defsheet = new DefSheet;
		}
		var attr, defBlock;
		['related', 'bindings',].forEach(type => {
			if ((attr = el.getAttribute(ChtmlCore.attributeMap[type])) && (defBlock = DefBlock.parse(attr))) {
				defsheet.applyTo(type, defBlock);
			}
		});
		return defsheet;
	}
		
	/**
	 * Composes a component from a super component.
	 *
	 * All definitions (related, bindings) will be inherited.
	 * If the idea is to import, the super component's element will be returned,
	 * (On import, nodes in component (as defined, if) will be uploaded into slots in the super component.)
	 *
	 * @param HTMLElement				elTo
	 * @param HTMLElement				elFrom
	 *
	 * @return HTMLElement
	 */
	static recompose(elTo, elFrom) {
		if (elTo.matches(ChtmlCore.elementMap.import)) {
			elFrom = elFrom.cloneNode(true);
			var elToNs = elTo.getAttribute(ChtmlCore.attributeMap.ns);
			var elFromNs = elFrom.getAttribute(ChtmlCore.attributeMap.ns);
			var elFromRoles = (elFrom.getAttribute(ChtmlCore.attributeMap.superrole) || '').split(' ').map(r => r.trim());
			// -------------------------
			// So we concat() the role attribute
			// -------------------------
			elFrom.setAttribute(ChtmlCore.attributeMap.ns, elToNs);
			// We will prepend defs from the elTo into elFrom
			ChtmlCore.recomposeDefs(elFrom, elTo, 'append');
			// -------------------------
			// Upload nodes into elFrom just the way slots work in Web Compoonents
			// -------------------------
			_arr_from((elTo.shadowRoot || elTo).children).forEach((replacementNode, i) => {
				if (replacementNode.matches(ChtmlCore.elementMap.defsheet)) {
					return;
				}
				replacementNode = replacementNode.cloneNode(true);
				var applicableContextRoles = [], applicableReplacementNodeRoles = [];
				var replacementNodeRoles = (replacementNode.getAttribute(ChtmlCore.attributeMap.subrole) || '').split(' ').map(r => r.trim());
				replacementNodeRoles.forEach(replacementNodeRole => {
					var _applicableContextRoles = elFromRoles.filter(contextRole => replacementNodeRole.startsWith(contextRole + '-'));
					if (_applicableContextRoles.length) {
						applicableContextRoles.push(_applicableContextRoles[0]);
						applicableReplacementNodeRoles.push(replacementNodeRole);
					}
				});
				if (applicableContextRoles.length) {
					var slotNodes;
					var contextSelector = applicableContextRoles.map(contextRole => '[' + ChtmlCore.attributeMap.superrole + '~="' + contextRole + '"]');
					var slotNodeSelector = applicableReplacementNodeRoles.map(replacementNodeRole => '[' + ChtmlCore.attributeMap.subrole + '~="' + replacementNodeRole + '"]');
					if ((elFrom.shadowRoot && (slotNodes = elFrom.shadowRoot.querySelectorAll(slotNodeSelector)))
					|| ((slotNodes = elFrom.querySelectorAll(slotNodeSelector)).length === 1 && slotNodes[0].closest(contextSelector) === elFrom)) {
						// We will prepend defs from the slot node into replacement node
						ChtmlCore.recomposeDefs(replacementNode, slotNodes[0], 'prepend');
						// Port to target...
						slotNodes[0].replaceWith(replacementNode);
					} else {
						this.error('Composition Error: Node #' + i + ' (at ' + elToNs + ') must match exactly one targetNode in ' + elFromNs + '! (' + slotNodes.length + ' matched)');
						return;
					}
				} else {
					elFrom.append(replacementNode);
				}
			});
			return elFrom;
		}
		// We will append defs from the elFrom into elTo
		ChtmlCore.recomposeDefs(elTo, elFrom, 'prepend');
		return elTo;
	}
	
	/**
	 * Composes definitions (related, bindings) from elFrom into elTo.
	 *
	 * @param HTMLElement				elTo
	 * @param HTMLElement				elFrom
	 * @param string					appendOrPrepend
	 * @param array						norecompose
	 *
	 * @return HTMLElement
	 */
	static recomposeDefs(elTo, elFrom, appendOrPrepend, norecompose = []) {
		norecompose = norecompose.concat([ChtmlCore.attributeMap.ns, ...ChtmlCore.attributeMap.nocompose]);
		if (elTo.hasAttribute('norecompose')) {
			norecompose = norecompose.concat((elTo.getAttribute('norecompose') || '*').split(' ').map(val => val.trim()));
		}
		// ----------------------------
		// Custom Composition...
		// ----------------------------
		if (_isFunction(ChtmlCore.recomposeCallback)) {
			var disposition = ChtmlCore.recomposeCallback(elTo, elFrom, appendOrPrepend, norecompose);
			if (disposition === false) {
				return false;
			} else if (_isString(disposition) || _isArray(disposition)) {
				norecompose = norecompose.concat(disposition);
			}
		}
		// ----------------------------
		// Merge list attributes...
		// ----------------------------
		_unique([ChtmlCore.attributeMap.superrole, ChtmlCore.attributeMap.subrole, 'role', 'class']).forEach(type => {
			var b_attr, a_attr;
			if (!norecompose.includes(type) && !norecompose.includes('*') && (b_attr = elFrom.getAttribute(type))) {
				if (a_attr = elTo.getAttribute(type)) {
					var jointList = appendOrPrepend === 'prepend' ? [b_attr, a_attr] : [a_attr, b_attr];
				} else {
					var jointList = [b_attr];
				}
				elTo.setAttribute(type, _unique(jointList.join(' ').split(' ').map(r => r.trim())).join(' '));
				norecompose.push(type);
			}
		});
		// ----------------------------
		// Merge definition attributes...
		// ----------------------------
		[ChtmlCore.attributeMap.related, ChtmlCore.attributeMap.bindings, 'style'].forEach(type => {
			var b_attr, a_attr;
			if (!norecompose.includes(type) && !norecompose.includes('*') && (b_attr = elFrom.getAttribute(type))) {
				if (a_attr = elTo.getAttribute(type)) {
					var jointDefs = appendOrPrepend === 'prepend' ? [b_attr, a_attr] : [a_attr, b_attr];
					if (!jointDefs[0].trim().endsWith(';')) {
						jointDefs[0] = jointDefs[0] + ';';
					}
				} else {
					var jointDefs = [b_attr];
				}
				elTo.setAttribute(type, jointDefs.join(' '));
				norecompose.push(type);
			}
		});
		// ----------------------------
		// Port all other attributes...
		// ----------------------------
		for (var i = 0; i < elFrom.attributes.length; i ++) {
			var attr = elFrom.attributes[i];
			if (!norecompose.includes(attr.name) && !norecompose.includes('*') && !elTo.hasAttribute(attr.name)) {
				elTo.setAttribute(attr.name, attr.value);
				norecompose.push(attr.name);
			}
		}
		// ----------------------------
		// For data blocks...
		// ----------------------------
		if (!norecompose.includes('@cps') && !norecompose.includes('*')) {
			var elToDefs = _arr_from((elTo.shadowRoot || elTo).children)
				.filter(node => node.matches(ChtmlCore.elementMap.defsheet));
			var elFromDefs = _arr_from((elFrom.shadowRoot || elFrom).children)
				.filter(node => node.matches(ChtmlCore.elementMap.defsheet));
			if (elFromDefs.length) {
				if (elToDefs.length) {
					elToDefs[0][appendOrPrepend](elFromDefs[0].textContent);
				} else {
					elTo.prepend(elFromDefs[0].cloneNode(true));
				}
			}
		}
		return true;
	}
	
	/**
	 * Resolves markup or selector string to a DOM element.
	 *
	 * @param sting						input
	 *
	 * @return HTMLElement
	 */
	static toElement(input) {
		if (ChtmlCore.ctxt.document) {
			var el;
			if (input.trim().startsWith('<')) {
				// Create a node from markup
				var temp = ChtmlCore.ctxt.document.createElement('div');
				temp.innerHtml = input;
				el = temp.firstChild;
			} else {
				el = ChtmlCore.ctxt.document.querySelector(input);
			}
			return el;
		}
	}
	
	/**
	 * Resolves markup or selector string to a DOM element.
	 *
	 * @param sting						input
	 * @param function					callback
	 *
	 * @return void
	 */
	static disconnectedCallback(el, callback) {
		if (el.parentNode) {
			var called = false;
			var observer = new MutationObserver(mutations => {
				mutations.forEach(m => {
					if (!called && _arr_from(m.removedNodes).includes(el)) {
						called = true;
						callback();
					}
				});
			});
			observer.observe(el.parentNode, {childList:true});
			ChtmlCore.disconnectedCallback(el.parentNode, () => {
				if (!called) {
					called = true;
					callback();
				}
			});
		}
	}
};

/**
 * @var object
 */
ChtmlCore.ctxt = {};

/**
 * @var object
 */
ChtmlCore.schema = Schema;

/**
 * @var object
 */
ChtmlCore.elementMap = {
	defsheet: 'script[type="text/jsen-p"]',
	bundle: 'chtml-bundle',
	import: 'chtml-import',
};

/**
 * @var object
 */
ChtmlCore.attributeMap = {
	ns: 'chtml-ns',
	related: 'chtml-related',
	bindings: 'chtml-directives',
	superrole: 'chtml-role',
	subrole: 'chtml-role',
	nocompose: ['nocompose', 'shadow',],
};

/**
 * @exports
 */
export default ChtmlCore;
