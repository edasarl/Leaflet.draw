L.Draw.Marker = L.Draw.Feature.extend({
	statics: {
		TYPE: 'marker'
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
		L.Draw.Feature.prototype.initialize.call(this, map, options);
	},
	_enableDrag: function (e) {
		var layer = e.layer || e;
		if (layer instanceof L.Marker) {
			layer.dragging.enable();
			this._backupLayer(layer);
			layer.on('dragend', this.onDragEnd, this);
		}
	},
	_disableDrag: function (e) {
		var layer = e.layer || e;
		if (layer instanceof L.Marker) {
			layer.dragging.disable();
			layer.off('dragend', this.onDragEnd, this);
		}
	},
	onDragEnd: function (e) {
		var layer = e.target;
		this.editedLayers.addLayer(layer);
		layer.edited = true;
	},
	revertLayers: function () {
		this.globalDrawLayer.eachLayer(function (layer) {
			if (layer instanceof L.Marker) {
				this._revertLayer(layer);
			}
		}, this);
	},
	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);
		if (this._map) {
			this._tooltip.updateContent({ text: L.drawLocal.draw.handlers.marker.tooltip.start});

			this._map._container.style.cursor = 'crosshair';
			this._map.on('mousemove', this._onMouseMove, this);
			this._map.on('click', this._onClick, this);

			this.drawLayer.addTo(this._map);
			this.globalDrawLayer.eachLayer(this._enableDrag, this);
			this.globalDrawLayer.on('layeradd', this._enableDrag, this);
			this.globalDrawLayer.on('click', this._propagateEvent, this);
		}
	},

	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);

		if (this._map) {
			this.globalDrawLayer.off('click', this._propagateEvent, this);
			this.globalDrawLayer.eachLayer(this._disableDrag, this);
			this.globalDrawLayer.off('layeradd', this._enableDrag, this);

			this._map._container.style.cursor = null;
			this._map.off('click', this._onClick, this);
			this._map.off('mousemove', this._onMouseMove, this);
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
			this._map.removeLayer(this.drawLayer);
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
		}
	},
	cancel: function () {
		this.drawLayer.clearLayers();
		this.revertLayers();
	},
	_fireCreatedEvent: function () {
		var marker = new L.Marker(this.latlng);

		var style = this._map.defaultStyles && this._map.defaultStyles.marker;
		if (style) {
			marker.setStyle(style);
		}

		this.drawLayer.addLayer(marker);
		marker.dragging.enable();
	}
});
