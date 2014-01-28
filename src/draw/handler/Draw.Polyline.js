L.Draw.Polyline = L.Draw.Feature.extend({
	statics: {
		TYPE: 'polyline'
	},

	Poly: L.Polyline,

	options: {
		allowIntersection: true,
		repeatMode: false,
		drawError: {
			color: '#b00b00',
			timeout: 2500
		},
		icon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon'
		}),
		guidelineDistance: 20,
		shapeOptions: {
			stroke: true,
			color: '#f06eaa',
			weight: 4,
			opacity: 0.5,
			fill: false,
			clickable: true
		},
		metric: true, // Whether to use the metric meaurement system or imperial
		showLength: true, // Whether to display distance in the tooltip
		zIndexOffset: 2000 // This should be > than the highest z-index any map layers
	},

	initialize: function (map, options, featureGroup) {
		// Need to set this here to ensure the correct message is used.
		this.options.drawError.message = L.drawLocal.draw.handlers.polyline.error;

		// Merge default drawError options with custom options
		if (options && options.drawError) {
			options.drawError = L.Util.extend({}, this.options.drawError, options.drawError);
		}

		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Polyline.TYPE;
		this.globalDrawLayer = featureGroup;
		this.drawLayer = L.featureGroup();
		this.editedLayers = L.layerGroup();
		this.tooltip = options.tooltip;
		L.Draw.Feature.prototype.initialize.call(this, map, options);
		var self = this;
		this._map.on('polyDragStart', function () {
			if (self._enabled) {
				self._map.off('click', self._onClick, self);
			}
		});
		this._map.on('polyDragEnd',  function () {
			if (self._enabled) {
				setTimeout(function () {self._map.on('click', self._onClick, self); }, 0);
			}
		});
	},

	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);
		this.globalDrawLayer
			.on('layeradd', this._enableLayerEdit, this);
		if (this._map) {
			this.backup();
			this._markers = [];

			this._markerGroup = new L.LayerGroup();
			this._map.addLayer(this._markerGroup);

			this._poly = new L.Polyline([], this.options.shapeOptions);
			this.tooltip.innerHTML = this._getTooltipText().text;
			this._map._container.style.cursor = 'crosshair';
			this._map.on('click', this._onClick, this);
			this._map
				.on('mousemove', this._onMouseMove, this)
				.on('zoomend', this._onZoomEnd, this);
		}
	},
	backup: function () {
		var self = this;
		this.globalDrawLayer.eachLayer(function (layer) {
			self._enableLayerEdit(layer);
		});
	},
	_enableLayerEdit: function (e) {
		var layer = e.layer || e;
		this._backupLayer(layer);
	},

	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);

		this._clearHideErrorTimeout();

		this._cleanUpShape();

		// remove markers from map
		this._map.removeLayer(this._markerGroup);
		delete this._markerGroup;
		delete this._markers;

		this._map.removeLayer(this._poly);
		delete this._poly;

		// clean up DOM
		this._clearGuides();

		this._map
			.off('mousemove', this._onMouseMove, this)
			.off('zoomend', this._onZoomEnd, this)
			.off('click', this._onClick, this);
		this._map._container.style.cursor = null;
		this.save();
		this.globalDrawLayer
			.off('layeradd', this._enableLayerEdit, this);
	},
	deleteLastVertex: function () {
		if (this._markers.length === 0) {
			return;
		}

		if (this._markers.length === 1) {
			this.removeHooks();
			this.addHooks();
			return;
		}

		var lastMarker = this._markers.pop(),
			poly = this._poly,
			latlng = this._poly.spliceLatLngs(poly.getLatLngs().length - 1, 1)[0];

		this._markerGroup.removeLayer(lastMarker);

		if (poly.getLatLngs().length < 2) {
			this._map.removeLayer(poly);
		}

		this._vertexChanged(latlng, false);
	},

	addVertex: function (latlng) {
		var markersLength = this._markers.length;

		if (markersLength > 0 && !this.options.allowIntersection && this._poly.newLatLngIntersects(latlng)) {
			this._showErrorTooltip();
			return;
		}
		else if (this._errorShown) {
			this._hideErrorTooltip();
		}

		this._markers.push(this._createMarker(latlng));

		this._poly.addLatLng(latlng);

		if (this._poly.getLatLngs().length === 2) {
			this._map.addLayer(this._poly);
		}

		this._vertexChanged(latlng, true);
	},

	_finishShape: function () {
		var intersects = this._poly.newLatLngIntersects(this._poly.getLatLngs()[0], true);

		if ((!this.options.allowIntersection && intersects) || !this._shapeIsValid()) {
			this._showErrorTooltip();
			return;
		}

		this._fireCreatedEvent();
		if (!this.options.repeatMode) {
			this.disable();
		} else {
			this._clearHideErrorTimeout();

			this._cleanUpShape();
			this._markerGroup.clearLayers();
			this._map.removeLayer(this._poly);

			// clean up DOM
			this._clearGuides();
			this._markers = [];

			this._poly = new L.Polyline([], this.options.shapeOptions);
			this.tooltip.innerHTML = this._getTooltipText().text;
		}
	},

	//Called to verify the shape is valid when the user tries to finish it
	//Return false if the shape is not valid
	_shapeIsValid: function () {
		return true;
	},

	_onZoomEnd: function () {
		this._updateGuide();
	},

	_onMouseMove: function (e) {
		var newPos = e.layerPoint,
			latlng = e.latlng;

		// Save latlng
		// should this be moved to _updateGuide() ?
		this._currentLatLng = latlng;

		// this._updateTooltip(latlng);

		// Update the guide line
		this._updateGuide(newPos);

		// Update the mouse marker position
		// this._mouseMarker.setLatLng(latlng);

		L.DomEvent.preventDefault(e.originalEvent);
	},

	_onClick: function (e) {
		var latlng = e.latlng || e.target.getLatLng();

		this.addVertex(latlng);
	},

	_vertexChanged: function (latlng, added) {
		this._updateFinishHandler();

		this._updateRunningMeasure(latlng, added);

		this._clearGuides();

		this._updateTooltip();
	},

	_updateFinishHandler: function () {
		var markerCount = this._markers.length;
		// The last marker should have a click handler to close the polyline
		if (markerCount > 1) {
			this._markers[markerCount - 1].on('click', this._finishShape, this);
		}

		// Remove the old marker click handler (as only the last point should close the polyline)
		if (markerCount > 2) {
			this._markers[markerCount - 2].off('click', this._finishShape, this);
		}
	},

	_createMarker: function (latlng) {
		var marker = new L.Marker(latlng, {
			icon: this.options.icon,
			zIndexOffset: this.options.zIndexOffset * 2
		});

		this._markerGroup.addLayer(marker);

		return marker;
	},

	_updateGuide: function (newPos) {
		var markerCount = this._markers.length;

		if (markerCount > 0) {
			newPos = newPos || this._map.latLngToLayerPoint(this._currentLatLng);

			// draw the guide line
			this._clearGuides();
			this._drawGuide(
				this._map.latLngToLayerPoint(this._markers[markerCount - 1].getLatLng()),
				newPos
			);
		}
	},

	_updateTooltip: function () {
		var text = this._getTooltipText().text;

		// if (latLng) {
		// 	this._tooltip.updatePosition(latLng);
		// }

		if (!this._errorShown) {
			this.tooltip.innerHTML = text;
		}
	},

	_drawGuide: function (pointA, pointB) {
		var length = Math.floor(Math.sqrt(Math.pow((pointB.x - pointA.x), 2) + Math.pow((pointB.y - pointA.y), 2))),
			i,
			fraction,
			dashPoint,
			dash;

		//create the guides container if we haven't yet
		if (!this._guidesContainer) {
			this._guidesContainer = L.DomUtil.create('div', 'leaflet-draw-guides', this._overlayPane);
		}

		//draw a dash every GuildeLineDistance
		for (i = this.options.guidelineDistance; i < length; i += this.options.guidelineDistance) {
			//work out fraction along line we are
			fraction = i / length;

			//calculate new x,y point
			dashPoint = {
				x: Math.floor((pointA.x * (1 - fraction)) + (fraction * pointB.x)),
				y: Math.floor((pointA.y * (1 - fraction)) + (fraction * pointB.y))
			};

			//add guide dash to guide container
			dash = L.DomUtil.create('div', 'leaflet-draw-guide-dash', this._guidesContainer);
			dash.style.backgroundColor =
				!this._errorShown ? this.options.shapeOptions.color : this.options.drawError.color;

			L.DomUtil.setPosition(dash, dashPoint);
		}
	},

	_updateGuideColor: function (color) {
		if (this._guidesContainer) {
			for (var i = 0, l = this._guidesContainer.childNodes.length; i < l; i++) {
				this._guidesContainer.childNodes[i].style.backgroundColor = color;
			}
		}
	},

	// removes all child elements (guide dashes) from the guides container
	_clearGuides: function () {
		if (this._guidesContainer) {
			while (this._guidesContainer.firstChild) {
				this._guidesContainer.removeChild(this._guidesContainer.firstChild);
			}
		}
	},

	_getTooltipText: function () {
		var showLength = this.options.showLength,
			labelText, distanceStr;

		if (this._markers.length === 0) {
			labelText = {
				text: L.drawLocal.draw.handlers.polyline.tooltip.start
			};
		} else {
			distanceStr = showLength ? this._getMeasurementString() : '';

			if (this._markers.length === 1) {
				labelText = {
					text: L.drawLocal.draw.handlers.polyline.tooltip.cont,
					subtext: distanceStr
				};
			} else {
				labelText = {
					text: L.drawLocal.draw.handlers.polyline.tooltip.end,
					subtext: distanceStr
				};
			}
		}
		return labelText;
	},

	_updateRunningMeasure: function (latlng, added) {
		var markersLength = this._markers.length,
			previousMarkerIndex, distance;

		if (this._markers.length === 1) {
			this._measurementRunningTotal = 0;
		} else {
			previousMarkerIndex = markersLength - (added ? 2 : 1);
			distance = latlng.distanceTo(this._markers[previousMarkerIndex].getLatLng());

			this._measurementRunningTotal += distance * (added ? 1 : -1);
		}
	},

	_getMeasurementString: function () {
		var currentLatLng = this._currentLatLng,
			previousLatLng = this._markers[this._markers.length - 1].getLatLng(),
			distance;

		// calculate the distance from the last fixed point to the mouse position
		distance = this._measurementRunningTotal + currentLatLng.distanceTo(previousLatLng);

		return L.GeometryUtil.readableDistance(distance, this.options.metric);
	},

	_showErrorTooltip: function () {
		this._errorShown = true;

		// Update tooltip
		this.tooltip.innerHTML = this.options.drawError.message;

		// Update shape
		this._updateGuideColor(this.options.drawError.color);
		this._poly.setStyle({ color: this.options.drawError.color });

		// Hide the error after 2 seconds
		this._clearHideErrorTimeout();
		this._hideErrorTimeout = setTimeout(L.Util.bind(this._hideErrorTooltip, this), this.options.drawError.timeout);
	},

	_hideErrorTooltip: function () {
		this._errorShown = false;

		this._clearHideErrorTimeout();

		// Revert tooltip
		this.tooltip.innerHTML = this._getTooltipText().text;

		// Revert shape
		this._updateGuideColor(this.options.shapeOptions.color);
		this._poly.setStyle({ color: this.options.shapeOptions.color });
	},

	_clearHideErrorTimeout: function () {
		if (this._hideErrorTimeout) {
			clearTimeout(this._hideErrorTimeout);
			this._hideErrorTimeout = null;
		}
	},

	_cleanUpShape: function () {
		if (this._markers.length > 1) {
			this._markers[this._markers.length - 1].off('click', this._finishShape, this);
		}
	},

	_fireCreatedEvent: function () {
		var poly = new this.Poly(this._poly.getLatLngs(), this.options.shapeOptions);
		this.globalDrawLayer.addLayer(poly);
		this.drawLayer.addLayer(poly);
	},
	save: function () {
		var self = this;

		var editedLayers = new L.LayerGroup();

		this.globalDrawLayer.eachLayer(function (layer) {
			var edited = false;
			if (layer instanceof L.FeatureGroup) {
				layer.eachLayer(function (geo) {
					if (geo.edited) {
						edited = true;
					}
				});
				layer.edited = edited;
			}
			if (layer.edited) {
				if (layer.saveId) {
					editedLayers.addLayer(layer);
				}
				layer.edited = false;
			}
		});
		this._map.fire('draw:edited', {layers: editedLayers});

		this.drawLayer.eachLayer(function (layer) {
			L.Draw.Feature.prototype._fireCreatedEvent.call(self, layer);
			self.globalDrawLayer.removeLayer(layer);
		});
		this.drawLayer.clearLayers();
		this._uneditedLayerProps = {};
	},
	cancel: function () {
		var self = this;
		this.drawLayer.eachLayer(function (layer) {
			self.globalDrawLayer.removeLayer(layer);
		});
		this.drawLayer.clearLayers();
		this.revertLayers();
		this._uneditedLayerProps = {};
		this.backup();
	},
	revertLayers: function () {
		this.globalDrawLayer.eachLayer(function (layer) {
			if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
				this._revertLayer(layer);
				layer.editing.updateMarkers();
			} else if (layer instanceof L.MultiPolyline) {
				this._revertLayer(layer);
				layer.eachLayer(function (geo) {
					geo.editing.updateMarkers();
				});
			}
		}, this);
	}
});
