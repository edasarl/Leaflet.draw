L.EditToolbar.Navigate = L.Handler.extend({
	statics: {
		TYPE: 'navigate' // not delete as delete is reserved in js
	},

	includes: L.Mixin.Events,

	initialize: function (map, options) {
		L.Handler.prototype.initialize.call(this, map);

		L.Util.setOptions(this, options);

		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.EditToolbar.Navigate.TYPE;
	},

	enable: function () {
		if (this._enabled) {
			return;
		}
		this.fire('enabled', { handler: this.type});
			//this disable other handlers

		this._map.fire('draw:navigatestart', { handler: this.type });

		L.Handler.prototype.enable.call(this);
	},

	disable: function () {
		if (!this._enabled) { return; }
		L.Handler.prototype.disable.call(this);
		this._map.fire('draw:navigatestop', { handler: this.type });
		this.fire('disabled', { handler: this.type});
	},

	addHooks: function () {
		var map = this._map;

		if (map) {
			map.getContainer().focus();
		}
	},

	removeHooks: function () {
	},
	revertLayers: function () {
	}
});
