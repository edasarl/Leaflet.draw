L.Draw.Marker = L.Draw.Feature.extend({
	statics: {
		TYPE: 'point'
	},

	options: {
		icon: new L.Icon.Default(),
		repeatMode: false,
		zIndexOffset: 2000 // This should be > than the highest z-index any markers
	},

	initialize: function (map, options, featureGroup) {
		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Marker.TYPE;

		this.drawLayer = L.featureGroup();
		this.editedLayers = L.layerGroup();
		this.globalDrawLayer = featureGroup;
		this.panel = options.panel;
		L.Draw.Feature.prototype.initialize.call(this, map, options);
	},
	_enableDrag: function (e) {
		var layer = e.layer || e;
		if (layer instanceof L.Marker) {
			layer.dragging.enable();
			layer.on('dragstart', this._backupLayer, this);
			layer.on('dragend', this.onDragEnd, this);
		}
	},
	_disableDrag: function (e) {
		var layer = e.layer || e;
		if (layer instanceof L.Marker) {
			layer.dragging.disable();
			layer.off('dragend', this.onDragEnd, this);
			layer.off('dragstart', this._backupLayer, this);
		}
	},
	onDragEnd: function (e) {
		var layer = e.target;
		this.editedLayers.addLayer(layer);
		layer.edited = true;
		this.panel.enableButtons();
	},
	revertLayers: function () {
		var self = this;
		this.globalDrawLayer.eachLayer(function (sublayer) {
			sublayer.eachLayer(function (layer) {
				if (layer instanceof L.Marker) {
					self._revertLayer(layer);
				}
			}, self);

		});
	},
	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);
		if (this._map) {
			this.panel.show();
			this.panel.updateToolTip(L.drawLocal.draw.handlers.marker.tooltip.start);
			this._map._container.style.cursor = 'crosshair';
			this._map.on('mousemove', this._onMouseMove, this);
			this._map.on('click', this._onClick, this);

			this.drawLayer.addTo(this._map);
			var self = this;
			this.globalDrawLayer.eachLayer(
				function (layer) {
					if (layer.editable) {
						layer.eachLayer(self._enableDrag, self);
						layer.on('layeradd', self._enableDrag, self);
					}
				}
			);
		}
	},

	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);

		if (this._map) {
			this.panel.hide();
			var self = this;
			this.globalDrawLayer.eachLayer(
				function (layer) {
					if (layer.editable) {
						layer.eachLayer(self._disableDrag, self);
						layer.off('layeradd', self._enableDrag, self);
					}
				}
			);
			this._map._container.style.cursor = null;
			this._map.off('click', this._onClick, this);
			this._map.off('mousemove', this._onMouseMove, this);
			this.save();
			this._map.removeLayer(this.drawLayer);
		}
	},

	_onMouseMove: function (e) {
		this.latlng = e.latlng;
	},

	_onClick: function () {
		this._fireCreatedEvent();

		if (!this.options.repeatMode) {
			this.disable();
		}
	},
	cancel: function () {
		this.drawLayer.clearLayers();
		this.revertLayers();
		this.panel.disableButtons();
	},
	save: function () {
		var self = this;
		this.drawLayer.eachLayer(function (marker) {
			L.Draw.Feature.prototype._fireCreatedEvent.call(self, marker);
		});
		this._map.fire('draw:edited', {layers: this.editedLayers});
		this.editedLayers.eachLayer(function (marker) {
			delete marker.edited;
		});
		this.drawLayer.clearLayers();
		this.editedLayers.clearLayers();
		this._uneditedLayerProps = {};
		this.panel.disableButtons();
	},
	_fireCreatedEvent: function () {
		var marker = new L.Marker(this.latlng); // could avoid marker.draw() by using this.options.icon
		this.drawLayer.addLayer(marker);
		marker.draw();
		marker.dragging.enable();
		this.panel.enableButtons();
	}
});
