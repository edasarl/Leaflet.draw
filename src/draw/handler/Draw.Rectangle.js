L.Draw.Rectangle = L.Draw.SimpleShape.extend({
	statics: {
		TYPE: 'rectangle'
	},

	options: {
		shapeOptions: {
			stroke: true,
			color: '#f06eaa',
			weight: 4,
			opacity: 0.5,
			fill: true,
			fillColor: null, //same as color by default
			fillOpacity: 0.2,
			clickable: true
		}
	},

	initialize: function (map, options, viewLayer, rectangleLayer) {
		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Rectangle.TYPE;

		this._initialLabelText = L.drawLocal.draw.handlers.rectangle.tooltip.start;
		this.viewLayer = viewLayer;
		this.rectangleLayer = rectangleLayer;
		this._deletedLayers = L.layerGroup();
		this.newViews = L.layerGroup();
		this.tooltip = options.tooltip;

		L.Draw.SimpleShape.prototype.initialize.call(this, map, options);
		var self = this;
		map.on('createRectangle', function (e) {
			var llstart = e.llstart,
				llend = e.llend;
			self.addHooks();
			self._startLatLng = llstart;
			self._drawShape(llend);
			self._fireCreatedEvent(e);
			self.save();
			self.removeHooks();
			self.disable();
		});
	},
	addHooks: function () {
		L.Draw.SimpleShape.prototype.addHooks.call(this);
		if (this._map) {
			this.viewLayer.on('click', this._remove, this);
			this.backup();
			this.rectangleLayer.on('layeradd', this._backupLayer, this);
		}
	},
	backup: function () {
		this.rectangleLayer.eachLayer(this._backupLayer, this);
	},
	removeHooks: function () {
		L.Draw.SimpleShape.prototype.removeHooks.call(this);
		if (this._map) {
			this.viewLayer.off('click', this._remove, this);
			this.rectangleLayer.off('layeradd', this._backupLayer, this);
			this.save();
		}
	},
	_remove: function (e) {
		var layer = e.layer;
		this.viewLayer.removeLayer(layer);
		this.rectangleLayer.removeLayer(layer._rectangle);
		this._deletedLayers.addLayer(layer);
	},
	cancel: function () {
		var self = this;
		this._deletedLayers.eachLayer(function (layer) {
			self.viewLayer.addLayer(layer);
			self.rectangleLayer.addLayer(layer._rectangle);
		});
		this._deletedLayers.clearLayers();
		this.newViews.eachLayer(function (rectangle) {
			self.rectangleLayer.removeLayer(rectangle);
			self.viewLayer.removeLayer(rectangle._icon);
		});
		this.newViews.clearLayers();
		this.rectangleLayer.eachLayer(function (rectangle) {
			self._revertLayer(rectangle);
			rectangle.editing.updateMarkers();
		});
	},
	save: function () {
		var self = this;

		this.newViews.eachLayer(function (rectangle) {
			L.Draw.SimpleShape.prototype._fireCreatedEvent.call(self, rectangle);
			rectangle.edited = false;
		});
		this.newViews.clearLayers();
		this._map.fire('draw:deleted', { layers: this._deletedLayers });
		this._deletedLayers.clearLayers();
		var editedLayers = new L.LayerGroup();
		this.rectangleLayer.eachLayer(function (layer) {
			if (layer.edited) {
				editedLayers.addLayer(layer);
				layer.edited = false;
			}
		});
		this._map.fire('draw:edited', {layers: editedLayers});
		this._uneditedLayerProps = {};
		this.backup();
	},
	_drawShape: function (prevLatlng) {
		var latlng = this._map._roundLatlng(this._startLatLng, prevLatlng, 10, 40)[0];
		if (!this._shape) {
			this._shape = new L.Rectangle(new L.LatLngBounds(this._startLatLng, latlng), this.options.shapeOptions);
			this._map.addLayer(this._shape);
		} else {
			this._shape.setBounds(new L.LatLngBounds(this._startLatLng, latlng));
		}
		var bounds = this._shape.getBounds(),
			northEast = this._map.project(bounds._northEast),
			southWest = this._map.project(bounds._southWest),
			zoom = this._map.getZoom(),
			width =  Math.round(northEast.x - southWest.x),
			height = Math.round(southWest.y - northEast.y),
			fullScreen = (width === 40 && height === 40);
		var htmlContent = fullScreen ? 'Plein écran': width + 'x' + height;

		var myIcon = L.divIcon({
			html: '<div class="coords-icon"> <span class="leaflet-draw-tooltip-single">' + htmlContent + ' z=' + zoom + '</span>' +  '</div>',
			iconSize: L.Point(40, 40),
			iconAnchor: [120, -25]
		});

		var iconLatLng = [bounds._southWest.lat, bounds._northEast.lng];

		if (!this._coordsMarker) {
			this._coordsMarker = new L.Marker(iconLatLng, {icon: myIcon});
			this._coordsMarker.setZIndexOffset(100002);
			this._map.addLayer(this._coordsMarker);
			this._coordsMarker.zoom = zoom;
			this._coordsMarker.minzoom = Math.max(zoom - 2, this._map.getMinZoom());
			this._coordsMarker.maxzoom = Math.min(zoom + 2, this._map.getMaxZoom());
		} else {
			this._coordsMarker.setIcon(myIcon);
			this._coordsMarker.setLatLng(iconLatLng);
		}
		this._coordsMarker.width = width;
		this._coordsMarker.height = height;
		this._coordsMarker.fullscreen = fullScreen;
	},

	_fireCreatedEvent: function (e) {
		var rectangle = new L.Rectangle(this._shape.getBounds(), this.options.shapeOptions);
		this._coordsMarker._rectangle = rectangle;
		rectangle._icon = this._coordsMarker;
		if (e) {
			this._coordsMarker.saveId = e.saveId;
			this._coordsMarker.cb = e.cb;
			this._coordsMarker.osmId = e.osmId;
		}
		var zoom = this._map.getZoom();
		rectangle._zoom = zoom;
		this._coordsMarker._title = '';
		this._coordsMarker._interface = 'leaflet';
		var myIcon =  L.divIcon({
			className: 'view-button view-delete'
		});
		this._coordsMarker.setIcon(myIcon);
		this._map.removeLayer(this._coordsMarker);
		this.viewLayer.addLayer(this._coordsMarker);
		this.rectangleLayer.addLayer(rectangle);
		this._coordsMarker = null;
		this.newViews.addLayer(rectangle);
	}
});
