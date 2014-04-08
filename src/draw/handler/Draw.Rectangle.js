L.View = L.Class.extend({
	statics: {
		defaultOptions: {
			color: '#555',
			weight: 2,
			opacity: 0.5,
			dashArray: '5, 5',
			fill: false,
			fillColor: null, //same as color by default
			fillOpacity: 0.2,
			clickable: false
		}
	},
	initialize: function (map, startll, endll, options) {
		this._map = map;
		this.startll = startll;
		var latlng = this._map._roundLatlng(this.startll, endll, 10, 40)[0];
		this.rectangle = new L.Rectangle(new L.LatLngBounds(startll, latlng), options);
		this.rectangle.view = this;
		this.setCoordsMarker();
		this.rectangle._icon = this._coordsMarker;
		this._coordsMarker._rectangle = this.rectangle;
	},
	setCoordsMarker: function () {
		var bounds = this.rectangle.getBounds(),
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
			this._coordsMarker = new L.ViewMarker(iconLatLng, {icon: myIcon});
			this._coordsMarker.setZIndexOffset(100002);
			this._map.addLayer(this._coordsMarker);
			this._coordsMarker.zoom = zoom;
			this.rectangle._zoom = zoom;
			this._coordsMarker._title = '';
			this._coordsMarker._interface = 'leaflet';
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
	finalize: function () {
		this._coordsMarker.setIcon(L.ViewMarker.prefIcon);
	},
	setBounds: function (endll) {
		var latlng = this._map._roundLatlng(this.startll, endll, 10, 40)[0];
		this.rectangle.setBounds(new L.LatLngBounds(this.startll, latlng));
		this.setCoordsMarker();
		return this;
	},
	getBounds: function () {
		return this.rectangle.getBounds();
	},

	setLatLng: function (latLng) {
		this._coordsMarker.setLatLng(latLng);
		return this;
	},
	getLatLng: function () {
		return this._coordsMarker.getLatLng();
	},
	getRectangle: function () {
		return this.rectangle;
	},
	getMarker: function () {
		return this._coordsMarker;
	},
	getProp: function () {
		var layer = this.rectangle;
		var bounds = layer.getBounds();
		return {
			center: this._map.getRealCenter(bounds),
			width: this._coordsMarker.width,
			height: this._coordsMarker.height,
			interface: this._coordsMarker._interface,
			zoom: layer._zoom,
			minzoom: this._coordsMarker.minzoom,
			maxzoom: this._coordsMarker.maxzoom,
			fullscreen: this._coordsMarker.fullscreen,
		};
	}
});



L.ViewMarker = L.Marker.extend({
	statics: {
		prefIcon: L.divIcon({
			className: 'view-button view-preference'
		})
	}
});

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
		this.panel = options.panel;

		L.Draw.SimpleShape.prototype.initialize.call(this, map, options);
		var self = this;
		map.on('viewFocus', function (e) {
			if (self._isDrawing) { return; }
			self.enable();
			self._onClick(e);
		});
	},
	addHooks: function () {
		L.Draw.SimpleShape.prototype.addHooks.call(this);
		if (this._map) {
			this.backup();
			this.rectangleLayer.on('layeradd', this._backupLayer, this);
			this._map.on('click editstart', this._blur, this);
			this._map.on('delete', this._remove, this);
		}
	},
	backup: function () {
		this.rectangleLayer.eachLayer(this._backupLayer, this);
	},
	removeHooks: function () {
		L.Draw.SimpleShape.prototype.removeHooks.call(this);
		if (this._map) {
			this._map.off('delete', this._remove, this);
			this._map.off('click editstart', this._blur, this);
			if (this._coordsMarker) {
				this._map.removeLayer(this._coordsMarker);
				this._coordsMarker = null;
			}
			if (this.focused) {
				L.DomUtil.removeClass(this.focused._icon, 'active');
				this.focused._rectangle.setStyle(L.View.defaultOptions);
				this.panel.blurView();
				this.focused = null;
			}
			this.rectangleLayer.off('layeradd', this._backupLayer, this);
			this.save(true);
		}
	},
	_blur: function () {
		if (!this.focused) {
			return;
		}
		this._container.style.cursor = 'crosshair';
		L.DomUtil.removeClass(this.focused._icon, 'active');
		this.focused._rectangle.setStyle(L.View.defaultOptions);
		this.panel.blurView();
		this.focused = null;
		var self = this;
		setTimeout(function () {
			self._map.on('click', self._onMouseDown, self);
		}, 0);
	},
	_onClick: function (e) {
		var layer = e.layer;
		if (this.focused === layer) {
			return;
		} else {
			this._container.style.cursor = '';
			if (this.focused) {
				L.DomUtil.removeClass(this.focused._icon, 'active');
				this.focused._rectangle.setStyle(L.View.defaultOptions);
				this.panel.blurView();
			}
			this.focused = layer;
			layer._rectangle.setStyle({opacity: 1, color: '#000000'});
			L.DomUtil.addClass(this.focused._icon, 'active');
			this.panel.focusView(layer);
			this._map.off('click', this._onMouseDown, this);
		}
	},
	_remove: function () {
		var layer = this.focused;
		this._blur();
		this.viewLayer.removeLayer(layer);
		this.rectangleLayer.removeLayer(layer._rectangle);
		this._deletedLayers.addLayer(layer);
	},
	deleteLastVertex: function () {
		if (this._isDrawing) {
			if (this._map  && this._shape) {
				this._map.removeLayer(this._shape.getMarker());
				this._map.removeLayer(this._shape.getRectangle());
				delete this._shape;
			}
			this.panel.updateToolTip(this._initialLabelText);
			this._isDrawing = false;
		}
	},
	cancel: function () {
		var self = this;
		if (this.focused && (this.focused._rectangle.edited ||
				this.newViews.hasLayer(this.focused._rectangle))) {
			this._blur();
		}
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
	save: function (exiting) {
		var self = this;
		this._deletedLayers.eachLayer(function (viewMarker) {
			if (self.newViews.hasLayer(viewMarker._rectangle)) {
				self.newViews.removeLayer(viewMarker._rectangle);
				self._deletedLayers.removeLayer(viewMarker);
			}
		});

		this.newViews.eachLayer(function (rectangle) {
			L.Draw.SimpleShape.prototype._fireCreatedEvent.call(self, rectangle.view);
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
		if (exiting !== true)
		{
			this._uneditedLayerProps = {};
			this.backup();
		}
	},
	_drawShape: function (prevLatlng) {
		if (!this._shape) {
			this._shape = new L.View(this._map, this._startLatLng, prevLatlng, this.options.shapeOptions);
			this._map.addLayer(this._shape.getRectangle());
			this._map.addLayer(this._shape.getMarker());
		} else {
			this._shape.setBounds(prevLatlng);
		}
	},

	_fireCreatedEvent: function () {
		this._shape.finalize();
		this._map.removeLayer(this._shape.getMarker());
		this.viewLayer.addLayer(this._shape.getMarker());
		this.rectangleLayer.addLayer(this._shape.getRectangle());
		this.newViews.addLayer(this._shape.getRectangle());
		var view = this._shape;
		this._shape = null;
		var self = this;
		setTimeout(function () {
			self._map.fire('viewFocus', {layer: view.getMarker()});
		}, 0);
	}
});
