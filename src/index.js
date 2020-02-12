
/**
 * @imports
 */
import {
	_before
} from '@onephrase/commons/src/Str.js';
import {  
	_from as _arr_from
} from '@onephrase/commons/src/Arr.js';
import Schema from './Schema.js';
import Matrix from './Def/Matrix.js';
import ChtmlCore from './ChtmlCore.js';
import Chtml from './Chtml.js';

/**
 * ---------------------------
 * The client-build entry
 * ---------------------------
 */

/**
 * Configure CHTM with
 * a global document.
 */
ChtmlCore.ctxt = window;

/**
 * Create a "ready" construct that
 * init-related functionality can leverage.
 */
var contentLoadedPromise = new Promise(resolve => {
	if (document.readyState === 'complete') {
		resolve(); return;
	}
	document.addEventListener('DOMContentLoaded', resolve, false);
	window.addEventListener('load', resolve, false);
});
// ------------------------------------
ChtmlCore.ready = (callback, waitForBundles = true) => {
	contentLoadedPromise.then(() => {
		if (!waitForBundles) {
			callback(); return;
		}
		ChtmlCore.initObj.loadingBundlesPromise.then(callback);
	});
};

/**
 * Create an initialization object that all
 * init-related functionality can build on.
 */
contentLoadedPromise.then(() => {
	// ------------------------------------
	ChtmlCore.initObj = (() => {
		var bundles = _arr_from(document.querySelectorAll('template[is="' + ChtmlCore.elementMap.bundle + '"]')).reverse();
		var remoteBundles = bundles.filter(b => b.hasAttribute('src') && !b.content.children.length);
		var loadingBundles = remoteBundles.map(b => new Promise(resolve => {
			b.addEventListener('bundleloadsuccess', resolve);
			b.addEventListener('bundleloaderror', resolve);
		}));
		var loadingBundlesPromise = Promise.all(loadingBundles).then(() => {
			loadingBundles.splice(0);
		});
		return {
			contentLoadedPromise,
			loadingBundlesPromise,
			bundles,
			remoteBundles,
			loadingBundles
		};
	})();
	// ------------------------------------
	// Configure CHTM with bundle sources.
	// ------------------------------------
	var warnedEarlyBundleAccess;
	var anticyclicBundlesQuery = [];
	ChtmlCore.bundles = new Matrix(ChtmlCore.initObj.bundles/*sources*/, []/*namespace*/, (bundle, namespace, superEl, bundleIndex) => {
		if (ChtmlCore.initObj.loadingBundles.length && !warnedEarlyBundleAccess) {
			warnedEarlyBundleAccess = true;
			console.warn('Remote bundles are still loading at this time! You should probabbly wrap bundle-dependent code within Chtml.ready(callback[, true/*waitForBundles*/]).');
		}
		var _namespace = namespace.join('/');
		if (anticyclicBundlesQuery.includes(_namespace)) {
			return ChtmlCore.bundles.find(namespace.slice(0, -1).join('/'));
		}
		anticyclicBundlesQuery.push(_namespace);
		var el = bundle.content.querySelector('[' + CSS.escape(ChtmlCore.attributeMap.ns) + '="' + _namespace + '"]');
		if (el && superEl) {
			try {
				var norecompose = [];
				if (bundle.hasAttribute('norecompose')) {
					norecompose = (bundle.getAttribute('norecompose') || '*').split(' ').map(val => val.trim());
				}
				el = ChtmlCore.recompose(el, superEl, 'prepend', norecompose);
			} catch(e) {
				console.error('[Inheritance error at source #' + bundleIndex + ']: ' + e.message);
			}
			anticyclicBundlesQuery.pop();
			return el;
		}
		anticyclicBundlesQuery.pop();
		return el ? el.cloneNode(true) 
			: (superEl ? superEl.cloneNode(true) : null);
	}/*getter*/);
});
			
/**
 * Define the customized built-in template element
 * that supports remote content.
 */
customElements.define(ChtmlCore.elementMap.bundle, class extends HTMLTemplateElement {

	/**
	 * This handles both triggers remote loading
	 * when so defined.
	 *
	 * @param string	name
	 * @param string	oldValue
	 * @param string	newValue
	 *
	 * @return void
	 */
	attributeChangedCallback(name, oldValue, newValue) {
		if (newValue) {
			this.load();
		}
	}

	/**
	 * Attempt to load remote content if so defined.
	 *
	 * @return void
	 */
	load() {
		var src = this.getAttribute('src');
		if (src && this.content.children.length) {
			console.warn('A CHTML bundle must define only either a remote content or local content! Bundle ignored.');
		} else if (src) {
			fetch(src).then(response => {
				return response.ok ? response.text() : Promise.reject(response.statusText);
			}).then(content => {
				this.innerHTML = content;
				// Dispatch the event.
				this.dispatchEvent(new Event('bundleloadsuccess'));
			}).catch(error => {
				// Dispatch the event.
				console.warn('Error fetching the bundle at ' + src + '. (' + error + ')');
				this.dispatchEvent(new Event('bundleloaderror'));
			});
		}
	}

	/**
	 * The attributes we want to observe.
	 *
	 * @return array
	 */
	static get observedAttributes() {
		return ['src'];
	}
}, {extends: 'template'});
			
/**
 * Define the custom import element
 */
customElements.define(ChtmlCore.elementMap.import, class extends HTMLElement {

	/**
	 * Tests if conditions are right to resolve the import.
	 *
	 * @return bool
	 */
	shouldResolve() {
		return !this.hasAttribute('ondemand')
			&& !this.closest('template')
			&& !this.closest(ChtmlCore.elementMap.import + '[ondemand]');
	}

	/**
	 * This triggers self-replacement
	 * when so defined.
	 *
	 * @return void
	 */
	connectedCallback() {
		this.processed = false;
		if (this.shouldResolve()) {
			this.resolve();
		}
	}

	/**
	 * This triggers self-replacement
	 * when so defined.
	 *
	 * @param string	name
	 * @param string	oldValue
	 * @param string	newValue
	 *
	 * @return void
	 */
	attributeChangedCallback(name, oldValue, newValue) {
		if (this.shouldResolve()) {
			this.resolve();
		}
	}

	/**
	 * Attempt self-replacement if so defined.
	 *
	 * @return void
	 */
	resolve() {
		Chtml.ready(() => {
			if (!this.parentNode) {
				return false;
			}
			var replacement, namespace, namespaceAttr = ChtmlCore.attributeMap.ns;
			if ((namespace = _before(this.getAttribute(namespaceAttr) || '', '//'))
			&& (namespace !== this.__namespace)) {
				this.__namespace = namespace;
				if (!(replacement = Chtml.import(namespace))) {
					this.innnerText = 'No element found on the namespace "' + namespace + '"!';
				} else {
					var resolved = ChtmlCore.recompose(this, replacement);
					if (this.hasAttribute('shadow')) {
						if (!this.parentNode.shadowRoot) {
							this.parentNode.attachShadow({mode: 'open'});
						}
						this.parentNode.shadowRoot.append(resolved);
						this.remove();
					} else {
						this.replaceWith(resolved);
					}
				}
			}
		});
	}

	/**
	 * The attributes we want to observe.
	 *
	 * @return array
	 */
	static get observedAttributes() {
		return ['ondemand', ChtmlCore.attributeMap.ns];
	}
});

/**
 * @exports
 */
export {
	ChtmlCore,
	Schema,
	Matrix
};
export default Chtml;