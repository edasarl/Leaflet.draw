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
		if (layer instanceof L.FeatureGroup) {
			return layer.eachLayer(this._backupLayer, this);
		}

		if (!this._uneditedLayerProps[id]) {
			if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
				this._uneditedLayerProps[id] = {
					latlngs: L.LatLngUtil.cloneLatLngs(layer.getLatLngs())
				};

			} else if (layer instanceof L.View) {
				var props = layer.getProperties();
				this._uneditedLayerProps[id] = {
					bounds: layer.getBounds(),
					minzoom: props.minzoom,
					maxzoom: props.maxzoom,
					interface: props.interface
				};
			} else if (layer instanceof L.Circle) {
				this._uneditedLayerProps[id] = {
					latlng: L.LatLngUtil.cloneLatLng(layer.getLatLng()),
					radius: layer.getRadius()
				};
			} else if (layer instanceof L.Marker) {
				this._uneditedLayerProps[id] = {
					latlng: L.LatLngUtil.cloneLatLng(layer.getLatLng())
				};
			}
		}
	},
	_revertLayer: function (layer) {
		var id = L.Util.stamp(layer);
		if (layer instanceof L.FeatureGroup) {
			return layer.eachLayer(this._revertLayer, this);
		}
		if (this._uneditedLayerProps.hasOwnProperty(id)) {
			// Polyline, Polygon or Rectangle
			if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
				layer.setLatLngs(this._uneditedLayerProps[id].latlngs);
				layer.edited = false;
			} else if (layer instanceof L.View) {
				layer.setProperties(this._uneditedLayerProps[id]);
				layer.setProperties({edited: false});
				layer.finalize();
			} else if (layer instanceof L.Circle) {
				layer.setLatLng(this._uneditedLayerProps[id].latlng);
				layer.setRadius(this._uneditedLayerProps[id].radius);
				layer.edited = false;
			} else if (layer instanceof L.Marker) {
				layer.setLatLng(this._uneditedLayerProps[id].latlng);
				layer.edited = false;
			}
		}
	},
	addHooks: function () {
		var map = this._map;

		if (map) {
			var self = this;
			L.DomUtil.disableTextSelection();

			map.getContainer().focus();

			// this._tooltip = new L.Tooltip(this._map);

			L.DomEvent.on(this._container, 'keyup', this._cancelDrawing, this);
			this._map.on('save', this.save, this);
			this._map.on('cancel', this.cancel, this);
			this._map.on('cancelOne', this.deleteLastVertex, this);
			this._map.on('edit', function () {
				self.panel.enableButtons();
			});
		}
	},

	removeHooks: function () {
		if (this._map) {
			this._map.off('edit');
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
		if (this.type === 'rectangle') {
			layer.saveLayer(function () {
				if (layer.saveCb) {
					layer.saveCb();
					delete layer.saveCb;
				}
			}, function (err) {
					console.log('error while saving a view: ', layer);
					this.panel.error('.button.save');
					this.panel.enableButtons();
					throw err;
				}
			);
		} else {
			var carte = this._map.carte;
			layer.saveLayer(function () {
				carte.tilejson.sources[0].stats[this.type]++;
				carte.redraw();
			}, function (err) {
				console.log('error while saving a ' + this.type + ': ', layer);
				this.panel.error('.button.save');
				this.panel.enableButtons();
				throw err;
			});
		}
	},

	// Cancel drawing when the escape key is pressed
	_cancelDrawing: function (e) {
		if (e.keyCode === 27) {
			this.disable();
		}
	}
});