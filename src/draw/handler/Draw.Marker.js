L.Draw.Marker = L.Draw.Feature.extend({
	statics: {
		TYPE: 'marker'
	},

	options: {
		icon: new L.Icon.Default(),
		repeatMode: false,
		zIndexOffset: 2000 // This should be > than the highest z-index any markers
	},

	initialize: function (map, options) {
		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Marker.TYPE;

		L.Draw.Feature.prototype.initialize.call(this, map, options);
	},

	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);

		if (this._map) {
			this._tooltip.updateContent({ text: L.drawLocal.draw.handlers.marker.tooltip.start});

			this._map._container.style.cursor = 'crosshair';
			this._map.on('mousemove', this._onMouseMove, this);
			this._map.on('click', this._onClick, this);
		}
	},

	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);

		if (this._map) {
			this._map._container.style.cursor = null;
			this._map.off('click', this._onClick, this);
			this._map.off('mousemove', this._onMouseMove, this);
		}
	},

	_onMouseMove: function (e) {
		this.latlng = e.latlng;
		this._tooltip.updatePosition(this.latlng);
	},

	_onClick: function () {
		this._fireCreatedEvent();

		if (!this.options.repeatMode) {
			this.disable();
		} else {
			this.removeHooks();
			this.addHooks();
		}
	},

	_fireCreatedEvent: function () {
		var marker = new L.Marker(this.latlng, { icon: this.options.icon});
		L.Draw.Feature.prototype._fireCreatedEvent.call(this, marker);
	}
});
