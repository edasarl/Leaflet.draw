L.Draw = {};

L.Draw.Feature = L.Handler.extend({
	includes: L.Mixin.Events,

	initialize: function (map, options) {
		this._map = map;
		this._container = map._container;
		this._overlayPane = map._panes.overlayPane;
		this._popupPane = map._panes.popupPane;

		// Merge default shapeOptions options with custom shapeOptions
		if (options && options.shapeOptions) {
			options.shapeOptions = L.Util.extend({}, this.options.shapeOptions, options.shapeOptions);
		}
		L.setOptions(this, options);
		this._uneditedLayerProps = {};
	},

	enable: function () {
		if (this._enabled) { return; }

		this.fire('enabled', { handler: this.type });

		this._map.fire('draw:drawstart', { layerType: this.type });

		L.Handler.prototype.enable.call(this);
	},

	disable: function () {
		if (!this._enabled) { return; }

		L.Handler.prototype.disable.call(this);

		this._map.fire('draw:drawstop', { layerType: this.type });

		this.fire('disabled', { handler: this.type });
	},
	_backupLayer: function (e) {
		var layer = e.layer || e.target || e;
		var id = L.Util.stamp(layer);

		if (!this._uneditedLayerProps[id]) {
			// Polyline, Polygon or Rectangle
			if (layer instanceof L.Polyline || layer instanceof L.Polygon || layer instanceof L.Rectangle) {
				this._uneditedLayerProps[id] = {
					latlngs: L.LatLngUtil.cloneLatLngs(layer.getLatLngs())
				};
				if (layer._icon) {
					this._uneditedLayerProps[id].icon = layer._icon.options.icon;
					this._uneditedLayerProps[id].iconLatLng = L.LatLngUtil.cloneLatLng(layer._icon.getLatLng());
					this._uneditedLayerProps[id].icon.width = layer._icon.width;
					this._uneditedLayerProps[id].icon.height = layer._icon.height;
					this._uneditedLayerProps[id].icon.fullscreen = layer._icon.fullscreen;
				}
			} else if (layer instanceof L.Circle) {
				this._uneditedLayerProps[id] = {
					latlng: L.LatLngUtil.cloneLatLng(layer.getLatLng()),
					radius: layer.getRadius()
				};
			} else { // Marker
				this._uneditedLayerProps[id] = {
					latlng: L.LatLngUtil.cloneLatLng(layer.getLatLng())
				};
			}
		}
	},
	_revertLayer: function (layer) {
		var id = L.Util.stamp(layer);
		layer.edited = false;
		if (this._uneditedLayerProps.hasOwnProperty(id)) {
			// Polyline, Polygon or Rectangle
			if (layer instanceof L.Polyline || layer instanceof L.Polygon || layer instanceof L.Rectangle) {
				layer.setLatLngs(this._uneditedLayerProps[id].latlngs);
				if (layer._icon) {
					layer._icon.setIcon(this._uneditedLayerProps[id].icon);
					layer._icon.setLatLng(this._uneditedLayerProps[id].iconLatLng);
					layer._icon.width = this._uneditedLayerProps[id].icon.width;
					layer._icon.height = this._uneditedLayerProps[id].icon.height;
					layer._icon.fullscreen = this._uneditedLayerProps[id].icon.fullscreen;
				}
			} else if (layer instanceof L.Circle) {
				layer.setLatLng(this._uneditedLayerProps[id].latlng);
				layer.setRadius(this._uneditedLayerProps[id].radius);
			} else { // Marker
				layer.setLatLng(this._uneditedLayerProps[id].latlng);
			}
		}
	},
	addHooks: function () {
		var map = this._map;

		if (map) {
			L.DomUtil.disableTextSelection();

			map.getContainer().focus();

			// this._tooltip = new L.Tooltip(this._map);

			L.DomEvent.on(this._container, 'keyup', this._cancelDrawing, this);
			this._map.on('save', this.save, this);
			this._map.on('cancel', this.cancel, this);
			this._map.on('cancelOne', this.deleteLastVertex, this);
		}
	},

	removeHooks: function () {
		if (this._map) {
			this._map.off('save', this.save, this);
			this._map.off('cancel', this.cancel, this);
			this._map.off('cancelOne', this.deleteLastVertex, this);
			L.DomUtil.enableTextSelection();

			// this._tooltip.dispose();
			// this._tooltip = null;

			L.DomEvent.off(this._container, 'keyup', this._cancelDrawing, this);
			// Clear the backups of the original layers
			this._uneditedLayerProps = {};
		}
	},

	setOptions: function (options) {
		L.setOptions(this, options);
	},

	_fireCreatedEvent: function (layer) {
		this._map.fire('draw:created', { layer: layer, layerType: this.type });
	},

	// Cancel drawing when the escape key is pressed
	_cancelDrawing: function (e) {
		if (e.keyCode === 27) {
			this.disable();
		}
	}
});