L.DrawToolbar = L.Toolbar.extend({

	options: {
		polyline: {},
		polygon: {},
		rectangle: {},
		circle: {},
		marker: {}
	},

	initialize: function (options) {
		// Ensure that the options are merged correctly since L.extend is only shallow
		for (var type in this.options) {
			if (this.options.hasOwnProperty(type)) {
				if (options[type]) {
					options[type] = L.extend({}, this.options[type], options[type]);
				}
			}
		}

		this._toolbarClass = 'leaflet-draw-draw';
		L.Toolbar.prototype.initialize.call(this, options);
	},
	getModeHandlers: function (map) {
		var featureGroup = this.options.featureGroup;
		return [
			{
				enabled: this.options.marker,
				handler: new L.Draw.Marker(map, this.options.marker, featureGroup,
					this.options.defaultProperties),
				title: L.drawLocal.draw.toolbar.buttons.marker
			},
			{
				enabled: this.options.polyline,
				handler: new L.Draw.Polyline(map, this.options.polyline, featureGroup,
					this.options.defaultProperties),
				title: L.drawLocal.draw.toolbar.buttons.polyline
			},
			{
				enabled: this.options.polygon,
				handler: new L.Draw.Polygon(map, this.options.polygon, featureGroup,
					this.options.defaultProperties),
				title: L.drawLocal.draw.toolbar.buttons.polygon
			},
			{
				enabled: this.options.circle,
				handler: new L.Draw.Circle(map, this.options.cicle),
				title: L.drawLocal.draw.toolbar.buttons.circle
			}
		];
	},

	// Get the actions part of the toolbar
	getActions: function () {
		return [];
	},
	cancel: function () {
		this._activeMode.handler.cancel();
	},
	_save: function () {
		this._activeMode.handler.save();
	},
	setOptions: function (options) {
		L.setOptions(this, options);

		for (var type in this._modes) {
			if (this._modes.hasOwnProperty(type) && options.hasOwnProperty(type)) {
				this._modes[type].handler.setOptions(options[type]);
			}
		}
	}
});
