/*
	Leaflet.draw, a plugin that adds drawing and editing tools to Leaflet powered maps.
	(c) 2012-2013, Jacob Toye, Smartrak

	https://github.com/Leaflet/Leaflet.draw
	http://leafletjs.com
	https://github.com/jacobtoye
*/
(function (window, document, undefined) {/*
 * Leaflet.draw assumes that you have already included the Leaflet library.
 */

L.drawVersion = '0.2.3-dev';

L.drawLocal = {
	draw: {
		toolbar: {
			actions: {
				title: 'Cancel drawing',
				text: 'Cancel'
			},
			undo: {
				title: 'Delete last point drawn',
				text: 'Delete last point'
			},
			buttons: {
				polyline: 'Draw a polyline',
				polygon: 'Draw a polygon',
				rectangle: 'Draw a rectangle',
				circle: 'Draw a circle',
				marker: 'Draw a marker'
			}
		},
		handlers: {
			circle: {
				tooltip: {
					start: 'Click and drag to draw circle.'
				}
			},
			marker: {
				tooltip: {
					start: 'Click map to place marker.'
				}
			},
			polygon: {
				tooltip: {
					start: 'Click to start drawing shape.',
					cont: 'Click to continue drawing shape.',
					end: 'Click first point to close this shape.'
				}
			},
			polyline: {
				error: '<strong>Error:</strong> shape edges cannot cross!',
				tooltip: {
					start: 'Click to start drawing line.',
					cont: 'Click to continue drawing line.',
					end: 'Click last point to finish line.'
				}
			},
			rectangle: {
				tooltip: {
					start: 'Click and drag to draw rectangle.'
				}
			},
			simpleshape: {
				tooltip: {
					end: 'Release mouse to finish drawing.'
				}
			}
		}
	},
	edit: {
		toolbar: {
			actions: {
				save: {
					title: 'Save changes.',
					text: 'Save'
				},
				cancel: {
					title: 'Cancel editing, discards all changes.',
					text: 'Cancel'
				}
			},
			buttons: {
				edit: 'Edit layers.',
				editDisabled: 'No layers to edit.',
				remove: 'Delete layers.',
				removeDisabled: 'No layers to delete.'
			}
		},
		handlers: {
			edit: {
				tooltip: {
					text: 'Drag handles, or marker to edit feature.',
					subtext: 'Click cancel to undo changes.'
				}
			},
			remove: {
				tooltip: {
					text: 'Click on a feature to remove'
				}
			}
		}
	}
};


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

	_saveDb: function (layer) {
		//layer is anything but a view!
		var carte = this._map.carte;
		var self = this;
		layer.saveLayer(function () {
			carte.tilejson.sources[0].stats[self.type]++;
			carte.redraw();
			self.drawLayer.removeLayer(layer);
			var id = L.Util.stamp(layer);
			delete self._uneditedLayerProps[id];
			self._backupLayer(layer);
		}, function (err) {
			console.log('error while saving a ' + self.type + ': ', layer);
			self.panel.error('.button.save');
			self.panel.enableButtons();
			throw err;
		});
	},
	_updateDb: function (layer) {
		//layer is anything but a view!
		var self = this;
		layer.updateLayer(function () {
			delete layer.edited;
			if (self.editedLayers) {
				self.editedLayers.removeLayer(layer);
			}
			var id = L.Util.stamp(layer);
			delete self._uneditedLayerProps[id];
			self._backupLayer(layer);
		}, function (err) {
			self.panel.error('.button.save');
			throw err;
		});
	},
	// Cancel drawing when the escape key is pressed
	_cancelDrawing: function (e) {
		if (e.keyCode === 27) {
			this.disable();
		}
	}
});

L.Draw.Polyline = L.Draw.Feature.extend({
	statics: {
		TYPE: 'line'
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
		this.drawLayer.editable = true;
		this.panel = options.panel;
		L.Draw.Feature.prototype.initialize.call(this, map, options);
		var self = this;
		this.drawLayer.on('click', function (e) {
			self._map.fire('click', e);
		});
		this._map.on('polyDragStart', function () {
			if (self._enabled) {
				self._map.off('click', self._onClick, self);
			}
		});
		this._map.on('polyDragEnd',  function () {
			if (self._enabled) {
				setTimeout(function () {self._map.on('click', self._onClick, self); }, 0);
				self.panel.enableButtons();
			}
		});
	},

	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);
		var self = this;
		this.globalDrawLayer.addLayer(this.drawLayer);
		this.globalDrawLayer.eachLayer(function (layer) {
			if (layer.editable) {
				layer.on('layeradd', self._enableLayerEdit, self);
			}
		});
		if (this._map) {
			this.backup();
			this._markers = [];

			this._markerGroup = new L.LayerGroup();
			this._map.addLayer(this._markerGroup);

			this._poly = new L.Polyline([], this.options.shapeOptions);
			this.panel.updateToolTip(this._getTooltipText().text);
			this.panel.show(true);
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
	_enableLayerEdition: function (layer) {
		if (layer instanceof L.FeatureGroup) {
			layer.eachLayer(this._enableLayerEdition, this);
		} else {
			layer.editing.enable();
			layer.dragging.enable();
		}
	},
	_disableLayerEdition: function (layer) {
		if (layer instanceof L.FeatureGroup) {
			layer.eachLayer(this._disableLayerEdition, this);
		} else {
			layer.editing.disable();
			layer.dragging.disable();
		}
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
		var self = this;

		this.panel.hide();
		this.globalDrawLayer.eachLayer(function (layer) {
			if (layer.editable) {
				layer.off('layeradd', self._enableLayerEdit, self);
			}
		});
		this.globalDrawLayer.removeLayer(this.drawLayer);
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
			this.panel.updateToolTip(this._getTooltipText().text);
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
	blur: function () {
		if (this.focused) {
			this._disableLayerEdition(this.focused);
			this.focused = null;
			return true;
		}
	},
	_onClick: function (e) {
		if (this.blur()) {
			return;
		}
		var layer = e.prevTarget;
		if (layer && this._markers.length === 0) {
			var bool;

			if (this.type === 'line') {
				bool = layer instanceof L.Polyline && !(layer instanceof L.Polygon) ||
				layer instanceof L.MultiPolyline;
			} else {
				bool = layer instanceof L.Polygon || layer instanceof L.MultiPolygon;
			}
			if (bool) {
				if (layer.refs && layer.refs.id) {
					var self = this;
					layer.tileLayer.loadGeometry(layer, function (preciseLayer) {
						self._enableLayerEdition(preciseLayer);
						self.focused = preciseLayer;
					});
				} else {
					this._enableLayerEdition(layer);
					this.focused = layer;
				}
				return;
			}
		}

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
			this.panel.updateToolTip(text);
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
		this.panel.updateToolTip(this.options.drawError.message);

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
		this.panel.updateToolTip(this._getTooltipText().text);

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
		this.drawLayer.addLayer(poly);
		this.panel.enableButtons();
	},
	save: function () {
		this.blur();
		var self = this;
		this.globalDrawLayer.eachLayer(function (layer) {
			if (layer.editable && layer !== self.drawLayer) {
				layer.eachLayer(function (feature) {
					var edited = false;
					if (feature instanceof L.FeatureGroup) {
						feature.eachLayer(function (geo) {
							if (geo.edited) {
								edited = true;
							}
						});
						feature.edited = edited;
					}
					if (feature.edited) {
						self._updateDb(layer);
					}
				});
			}
		});
		this.drawLayer.eachLayer(function (layer) {
			self._saveDb(layer);
		});
		this.panel.disableButtons();
	},
	cancel: function () {
		this.blur();
		this.drawLayer.clearLayers();
		this.revertLayers();
		this._uneditedLayerProps = {};
		this.backup();
		this.panel.disableButtons();
	},
	revertLayers: function () {
		var self = this;
		this.globalDrawLayer.eachLayer(function (sublayer) {
			sublayer.eachLayer(function (layer) {
				if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
					this._revertLayer(layer);
				} else if (layer instanceof L.MultiPolyline) {
					this._revertLayer(layer);
				}
			}, self);
		});
	}
});


L.Draw.Polygon = L.Draw.Polyline.extend({
	statics: {
		TYPE: 'polygon'
	},

	Poly: L.Polygon,

	options: {
		showArea: false,
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

	initialize: function (map, options, featureGroup) {
		L.Draw.Polyline.prototype.initialize.call(this, map, options, featureGroup);

		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Polygon.TYPE;
	},

	_updateFinishHandler: function () {
		var markerCount = this._markers.length;

		// The first marker should have a click handler to close the polygon
		if (markerCount === 1) {
			this._markers[0].on('click', this._finishShape, this);
		}

		// Add and update the double click handler
		// if (markerCount > 2) {
		// 	this._markers[markerCount - 1].on('dblclick', this._finishShape, this);
		// 	// Only need to remove handler if has been added before
		// 	if (markerCount > 3) {
		// 		this._markers[markerCount - 2].off('dblclick', this._finishShape, this);
		// 	}
		// }
	},

	_getTooltipText: function () {
		var text, subtext;

		if (this._markers.length === 0) {
			text = L.drawLocal.draw.handlers.polygon.tooltip.start;
		} else if (this._markers.length < 3) {
			text = L.drawLocal.draw.handlers.polygon.tooltip.cont;
		} else {
			text = L.drawLocal.draw.handlers.polygon.tooltip.end;
			subtext = this._getMeasurementString();
		}

		return {
			text: text,
			subtext: subtext
		};
	},

	_getMeasurementString: function () {
		var area = this._area;

		if (!area) {
			return null;
		}

		return L.GeometryUtil.readableArea(area, this.options.metric);
	},

	_shapeIsValid: function () {
		return this._markers.length >= 3;
	},

	_vertexAdded: function () {
		// Check to see if we should show the area
		if (this.options.allowIntersection || !this.options.showArea) {
			return;
		}

		var latLngs = this._poly.getLatLngs();

		this._area = L.GeometryUtil.geodesicArea(latLngs);
	},

	_cleanUpShape: function () {
		var markerCount = this._markers.length;

		if (markerCount > 0) {
			this._markers[0].off('click', this._finishShape, this);

			// if (markerCount > 2) {
			// 	this._markers[markerCount - 1].off('dblclick', this._finishShape, this);
			// }
		}
	},
	revertLayers: function () {
		var self = this;
		this.globalDrawLayer.eachLayer(function (sublayer) {
			sublayer.eachLayer(function (layer) {
				if (layer instanceof L.Polygon) {
					this._revertLayer(layer);
				} else if (layer instanceof L.MultiPolygon) {
					this._revertLayer(layer);
				}
			}, self);
		});
	}
	// ,
	// _fireCreatedEvent: function () {
	// 	var poly = new this.builder(this._poly.getLatLngs(), this.options.shapeOptions);
	// 	L.Draw.Feature.prototype._fireCreatedEvent.call(this, poly);
	// },
	// _finishPoly: function () {
	// 	this.builder = L.Polygon;
	// 	this._finishShape();
	// },
	// _finishLine: function () {
	// 	this.builder = L.Polyline;
	// 	this._finishShape();
	// }
});


L.SimpleShape = {};

L.Draw.SimpleShape = L.Draw.Feature.extend({
	options: {
		repeatMode: false
	},

	initialize: function (map, options) {
		this._endLabelText = L.drawLocal.draw.handlers.simpleshape.tooltip.end;

		L.Draw.Feature.prototype.initialize.call(this, map, options);
	},

	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);
		if (this._map) {
			//TODO refactor: move cursor to styles
			this._container.style.cursor = 'crosshair';
			this.panel.show(true);
			this.panel.updateToolTip(this._initialLabelText);
			this._map
				.on('click', this._onMouseDown, this)
				.on('mousemove', this._onMouseMove, this);
		}
	},

	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);
		if (this._map) {
			//TODO refactor: move cursor to styles
			this._container.style.cursor = '';
			this.panel.hide();

			this._map
				.off('click', this._onMouseDown, this)
				.off('mousemove', this._onMouseMove, this);

			// If the box element doesn't exist they must not have moved the mouse, so don't need to destroy/return
			if (this._shape) {
				this._map.removeLayer(this._shape);
				delete this._shape;
			}
		}
		this._isDrawing = false;
	},
	_onMouseDown: function (e) {
		if (this._isDrawing) {
			if (this._shape) {
				this._fireCreatedEvent();
			}
			if (!this.options.repeatMode) {
				this.disable();
			} else {
				if (this._map) {

					// If the box element doesn't exist they must not have moved the mouse, so don't need to destroy/return
					if (this._shape) {
						this._map.removeLayer(this._shape);
						delete this._shape;
					}
				}
				this.panel.updateToolTip(this._initialLabelText);
				this._isDrawing = false;
			}
			return;
		} else {
			this._isDrawing = true;
			this._startLatLng = e.latlng;
			L.DomEvent.preventDefault(e.originalEvent);
			this.panel.updateToolTip(this._endLabelText);
		}
	},

	_onMouseMove: function (e) {
		var latlng = e.latlng;

		if (this._isDrawing) {
			this._drawShape(latlng);
		}
	}
});

L.View = L.Class.extend({
	includes: L.Mixin.Events,
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
	initialize: function (map, shape, drawOptions, shapeOptions) {
		this._map = map;
		this.zoom = shape.zoom || this._map.getZoom();
		this.startll = shape.startll;
		this.endll = shape.endll;

		var latlng = shape.round ? this._map._roundLatlng(this.startll, this.endll, 10, 40, this.zoom)[0] : this.endll;
		this.rectangle = new L.Rectangle(new L.LatLngBounds(this.startll, latlng), drawOptions);
		this.editing = this.rectangle.editing;
		this.rectangle._zoom = this.zoom;
		this.rectangle.view = this;
		this._interface = shapeOptions && shapeOptions.interface || 'leaflet';
		this._minzoom = Math.max(shapeOptions && shapeOptions.minzoom || (this.zoom - 2), this._map.getMinZoom());
		this._maxzoom = Math.min(shapeOptions && shapeOptions.maxzoom || (this.zoom + 2), this._map.getMaxZoom());
		this._legend = shapeOptions && shapeOptions.legend || '';
		this.setCoordsMarker();
	},
	setCoordsMarker: function () {
		var bounds = this.rectangle.getBounds(),
			northEast = this._map.project(bounds._northEast, this.zoom),
			southWest = this._map.project(bounds._southWest, this.zoom),
			width =  Math.round(northEast.x - southWest.x),
			height = Math.round(southWest.y - northEast.y),
			fullScreen = (width === 40 && height === 40);
		var htmlContent = fullScreen ? 'Plein écran': width + 'x' + height;

		var myIcon = L.divIcon({
			html: '<span class="leaflet-draw-tooltip-single">' + htmlContent + ' z=' +
			this.rectangle._zoom + '</span>',
			iconAnchor: [110, -10],
			className: 'coords-icon'
		});

		var iconLatLng = [bounds._southWest.lat, bounds._northEast.lng];

		if (!this._coordsMarker) {
			this._coordsMarker = new L.ViewMarker(iconLatLng, {icon: myIcon});
			this._coordsMarker.setZIndexOffset(100002);
			this._coordsMarker._rectangle = this.rectangle;
			this._coordsMarker.view = this;
		} else {
			this._coordsMarker.setIcon(myIcon);
			this._coordsMarker.setLatLng(iconLatLng);
		}
		this._width = width;
		this._height = height;
		this._fullscreen = fullScreen;
	},
	finalize: function () {
		this._coordsMarker.setIcon(L.ViewMarker.prefIcon);
	},
	setBounds: function (endll) {
		if (endll instanceof L.LatLngBounds) {
			this.rectangle.setBounds(endll);
		} else {
			var latlng = this._map._roundLatlng(this.startll, endll, 10, 40, this.zoom)[0];
			this.rectangle.setBounds(new L.LatLngBounds(this.startll, latlng));
		}

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
	getProperties: function (saving) {
		var obj = {
			width: this._width,
			height: this._height,
			zoom: this.rectangle._zoom,
			interface: this._interface,
			minzoom: this._minzoom,
			maxzoom: this._maxzoom,
			fullscreen: this._fullscreen,
			legend: this._legend
		};
		if (!saving) {
			obj.edited = this.rectangle.edited;
		}
		return obj;
	},
	setProperties: function (obj) {
		if (obj.bounds) {this.setBounds(obj.bounds); }
		if (obj.interface) {this._interface = obj.interface; }
		if (obj.minzoom) {this._minzoom = obj.minzoom; }
		if (obj.maxzoom) {this._maxzoom = obj.maxzoom; }
		if ('edited' in obj) {this.rectangle.edited = obj.edited; }
		if ('legend' in obj) {this._legend = obj.legend; }
		return this;
	},
	onAdd: function (map) {
		map.addLayer(this.rectangle);
		map.addLayer(this._coordsMarker);
		var self = this;
		this._coordsMarker.on('click', function () {
			self.fire('click');
		});
	},
	onRemove: function (map) {
		map.removeLayer(this.rectangle);
		map.removeLayer(this._coordsMarker);
		this._coordsMarker.off('click');
	},
	setStyle: function (obj) {
		this.rectangle.setStyle(obj);
		return this;
	},
	addClass: function (className) {
		L.DomUtil.addClass(this._coordsMarker._icon, className);
		L.DomUtil.addClass(this.editing._moveMarker._icon, className);
		return this;
	},
	removeClass: function (className) {
		L.DomUtil.removeClass(this._coordsMarker._icon, className);
		L.DomUtil.removeClass(this.editing._moveMarker._icon, className);
		return this;
	},
	toGeoJSON: function () {
		return this.rectangle.toGeoJSON();
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

	initialize: function (map, options, viewLayer) {
		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Rectangle.TYPE;

		this._initialLabelText = L.drawLocal.draw.handlers.rectangle.tooltip.start;
		this.viewLayer = viewLayer;
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
			this.viewLayer.on('layeradd', this._backupLayer, this);
			this._map.on('click editstart', this._blur, this);
			this._map.on('delete', this._remove, this);
			this._map.on('saveOne', this._saveOne, this);
		}
	},
	backup: function () {
		this.viewLayer.eachLayer(this._backupLayer, this);
	},
	removeHooks: function () {
		L.Draw.SimpleShape.prototype.removeHooks.call(this);
		if (this._map) {
			this._map.off('delete', this._remove, this);
			this._map.off('click editstart', this._blur, this);
			if (this.focused) {
				this.focused.removeClass('active');
				this.focused.setStyle(L.View.defaultOptions);
				this.panel.blurView();
				this.focused = null;
			}
			this.viewLayer.off('layeradd', this._backupLayer, this);
			this.save(true);
		}
	},
	_blur: function () {
		if (!this.focused) {
			return;
		}
		this._container.style.cursor = 'crosshair';
		this.focused.removeClass('active');
		this.focused.setStyle(L.View.defaultOptions);
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
				this.focused.removeClass('active');
				this.focused.setStyle(L.View.defaultOptions);
				this.panel.blurView();
			}
			this.focused = layer;
			layer.setStyle({opacity: 1, color: '#000000'});
			layer.addClass('active');
			this.panel.focusView(layer);
			this._map.off('click', this._onMouseDown, this);
		}
	},
	_remove: function () {
		var layer = this.focused;
		this._blur();
		this.viewLayer.removeLayer(layer);
		if (this.newViews.hasLayer(layer)) {
			this.newViews.removeLayer(layer);
		} else {
			this._deletedLayers.addLayer(layer);
		}

	},
	deleteLastVertex: function () {
		if (this._isDrawing) {
			if (this._map  && this._shape) {
				this._map.removeLayer(this._shape);
				delete this._shape;
			}
			this.panel.updateToolTip(this._initialLabelText);
			this._isDrawing = false;
		}
	},
	cancel: function () {
		var self = this;
		if (this.focused && (this.focused.getProperties().edited ||
				this.newViews.hasLayer(this.focused))) {
			this._blur();
		}
		this._deletedLayers.eachLayer(function (layer) {
			self.viewLayer.addLayer(layer);
		});
		this._deletedLayers.clearLayers();
		this.newViews.eachLayer(function (layer) {
			self.viewLayer.removeLayer(layer);
		});
		this.newViews.clearLayers();
		this.viewLayer.eachLayer(function (layer) {
			self._revertLayer(layer);
			layer.editing.updateMarkers();
		});
		this.panel.disableButtons();
	},
	save: function (exiting) {
		this.panel.disableButtons();
		var self = this;
		this.newViews.eachLayer(function (view) {
			view.saveLayer(function () {
				view.setProperties({edited: false});
				self.newViews.removeLayer(view);
				if (exiting !== true) {
					var id = L.Util.stamp(view);
					delete self._uneditedLayerProps[id];
					self._backupLayer(view);
				}
			}, function (err) {
				console.log('error while saving a view: ', view);
				self.panel.error('.button.save');
				self.panel.enableButtons();
				throw err;
			});
		});
		this._deletedLayers.eachLayer(function (view) {
			view.deleteLayer(function () {
				self._deletedLayers.removeLayer(view);
				if (exiting !== true) {
					var id = L.Util.stamp(view);
					delete self._uneditedLayerProps[id];
				}
			}, function (err) {
				console.log('error while deleting a view: ', view.refs.id);
				self.panel.error('.button.delete');
				self.panel.enableButtons();
				throw err;
			});
		});
		this.viewLayer.eachLayer(function (view) {
			if (view.getProperties().edited && !self.newViews.hasLayer(view)) {
				view.updateLayer(function () {
					view.setProperties({edited: false});
					if (exiting !== true) {
						var id = L.Util.stamp(view);
						delete self._uneditedLayerProps[id];
						self._backupLayer(view);
					}
				}, function (err) {
					self.panel.error('.button.save');
					self.panel.enableButtons();
					throw err;
				});
			}
		});
	},
	_saveOne: function (e) {
		var self = this;
		var view = this.focused;
		function finalize() {
			var id = L.Util.stamp(view);
			delete self._uneditedLayerProps[id];
			self._backupLayer(view);
			if (self.newViews.getLayers().length === 0) {
				var memo = false;
				self.viewLayer.eachLayer(function (view) {
					memo = memo || view.getProperties().edited;
				});
				if (!memo) {
					self.panel.disableButtons();
				}
			}
		}
		if (this.newViews.hasLayer(view)) {
			view.saveLayer(function () {
				view.setProperties({edited: false});
				self.newViews.removeLayer(view);
				if (e.done) {
					e.done();
				}
				finalize();
			}, function (err, res) {
				console.log('error while saving a view: ', view);
				self.panel.error('.button.save');
				self.panel.enableButtons();
				if (e.error) {
					e.error(err, res);
				}
				throw err;
			});
		} else if (view.rectangle.edited) {
			view.updateLayer(function () {
				view.setProperties({edited: false});
				if (e.done) {
					e.done();
				}
				finalize();
			}, function (err, res) {
				self.panel.error('.button.save');
				if (e.error) {
					e.error(err, res);
				}
				throw err;
			});
		} else {
			e.done();
		}

	},
	_drawShape: function (prevLatlng) {
		if (!this._shape) {
			this._shape = new L.View(this._map, {
				startll: this._startLatLng,
				endll: prevLatlng,
				round: true
			}, this.options.shapeOptions);
			this._map.addLayer(this._shape);
		} else {
			this._shape.setBounds(prevLatlng);
		}
	},

	_fireCreatedEvent: function () {
		this._shape.finalize();
		this._map.removeLayer(this._shape);
		this.viewLayer.addLayer(this._shape);
		this.newViews.addLayer(this._shape);
		var view = this._shape;
		this._shape = null;
		var self = this;
		setTimeout(function () {
			self._map.fire('viewFocus', {layer: view});
		}, 0);
		this.panel.enableButtons();
	}
});


L.Draw.Circle = L.Draw.SimpleShape.extend({
	statics: {
		TYPE: 'circle'
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
		},
		showRadius: true,
		metric: true // Whether to use the metric meaurement system or imperial
	},

	initialize: function (map, options) {
		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Circle.TYPE;

		this._initialLabelText = L.drawLocal.draw.handlers.circle.tooltip.start;

		L.Draw.SimpleShape.prototype.initialize.call(this, map, options);
	},

	_drawShape: function (latlng) {
		if (!this._shape) {
			this._shape = new L.Circle(this._startLatLng, this._startLatLng.distanceTo(latlng), this.options.shapeOptions);
			this._map.addLayer(this._shape);
		} else {
			this._shape.setRadius(this._startLatLng.distanceTo(latlng));
		}
	},

	_fireCreatedEvent: function () {
		var circle = new L.Circle(this._startLatLng, this._shape.getRadius(), this.options.shapeOptions);
		L.Draw.SimpleShape.prototype._fireCreatedEvent.call(this, circle);
	},

	_onMouseMove: function (e) {
		var latlng = e.latlng,
			showRadius = this.options.showRadius,
			useMetric = this.options.metric,
			radius;

		this._tooltip.updatePosition(latlng);
		if (this._isDrawing) {
			this._drawShape(latlng);

			// Get the new radius (rounded to 1 dp)
			radius = this._shape.getRadius().toFixed(1);

			this._tooltip.updateContent({
				text: this._endLabelText,
				subtext: showRadius ? 'Radius: ' + L.GeometryUtil.readableDistance(radius, useMetric) : ''
			});
		}
	}
});


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
		this.drawLayer.eachLayer(function (layer) {
			self._saveDb(layer);
		});
		this.editedLayers.eachLayer(function (layer) {
			self._updateDb(layer);
		});
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


L.Edit = L.Edit || {};

/*
 * L.Edit.Poly is an editing handler for polylines and polygons.
 */

L.Edit.Poly = L.Handler.extend({
	options: {
		icon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon'
		})
	},

	initialize: function (poly, options) {
		this._poly = poly;
		L.setOptions(this, options);
	},

	addHooks: function () {
		if (this._poly._map) {
			this._map = this._poly._map;
			if (!this._markerGroup) {
				this._initMarkers();
			}
			this._poly._map.addLayer(this._markerGroup);
		}
	},

	removeHooks: function () {
		if (this._poly._map) {
			this._poly._map.removeLayer(this._markerGroup);
			delete this._markerGroup;
			delete this._markers;
		}
		this._map = null;
	},

	updateMarkers: function () {
		this._markerGroup.clearLayers();
		this._initMarkers();
	},

	_initMarkers: function () {
		if (!this._markerGroup) {
			this._markerGroup = new L.LayerGroup();
		}
		this._markers = [];

		var latlngs = this._poly._latlngs,
			i, j, len, marker;

		// TODO refactor holes implementation in Polygon to support it here

		for (i = 0, len = latlngs.length; i < len; i++) {

			marker = this._createMarker(latlngs[i], i);
			marker.on('click', this._onMarkerClick, this);
			this._markers.push(marker);
		}

		var markerLeft, markerRight;

		for (i = 0, j = len - 1; i < len; j = i++) {
			if (i === 0 && !(L.Polygon && (this._poly instanceof L.Polygon))) {
				continue;
			}

			markerLeft = this._markers[j];
			markerRight = this._markers[i];

			this._createMiddleMarker(markerLeft, markerRight);
			this._updatePrevNext(markerLeft, markerRight);
		}
	},

	_createMarker: function (latlng, index) {
		var marker = new L.Marker(latlng, {
			draggable: true,
			icon: this.options.icon
		});

		marker._origLatLng = latlng;
		marker._index = index;

		marker.on('drag', this._onMarkerDrag, this);
		marker.on('dragend', this._fireEdit, this);

		this._markerGroup.addLayer(marker);

		return marker;
	},

	_removeMarker: function (marker) {
		var i = marker._index;

		this._markerGroup.removeLayer(marker);
		this._markers.splice(i, 1);
		this._poly.spliceLatLngs(i, 1);
		this._updateIndexes(i, -1);

		marker
			.off('drag', this._onMarkerDrag, this)
			.off('dragend', this._fireEdit, this)
			.off('click', this._onMarkerClick, this);
	},

	_fireEdit: function () {
		this._poly.edited = true;
		this._poly.fire('edit');
		this._map.fire('edit');
	},

	_onMarkerDrag: function (e) {
		var marker = e.target;

		L.extend(marker._origLatLng, marker._latlng);

		if (marker._middleLeft) {
			marker._middleLeft.setLatLng(this._getMiddleLatLng(marker._prev, marker));
		}
		if (marker._middleRight) {
			marker._middleRight.setLatLng(this._getMiddleLatLng(marker, marker._next));
		}

		this._poly.redraw();
	},

	_onMarkerClick: function (e) {
		var minPoints = L.Polygon && (this._poly instanceof L.Polygon) ? 4 : 3,
			marker = e.target;

		// If removing this point would create an invalid polyline/polygon don't remove
		if (this._poly._latlngs.length < minPoints) {
			return;
		}

		// remove the marker
		this._removeMarker(marker);

		// update prev/next links of adjacent markers
		this._updatePrevNext(marker._prev, marker._next);

		// remove ghost markers near the removed marker
		if (marker._middleLeft) {
			this._markerGroup.removeLayer(marker._middleLeft);
		}
		if (marker._middleRight) {
			this._markerGroup.removeLayer(marker._middleRight);
		}

		// create a ghost marker in place of the removed one
		if (marker._prev && marker._next) {
			this._createMiddleMarker(marker._prev, marker._next);

		} else if (!marker._prev) {
			marker._next._middleLeft = null;

		} else if (!marker._next) {
			marker._prev._middleRight = null;
		}

		this._fireEdit();
	},

	_updateIndexes: function (index, delta) {
		this._markerGroup.eachLayer(function (marker) {
			if (marker._index > index) {
				marker._index += delta;
			}
		});
	},

	_createMiddleMarker: function (marker1, marker2) {
		var latlng = this._getMiddleLatLng(marker1, marker2),
		    marker = this._createMarker(latlng),
		    onClick,
		    onDragStart,
		    onDragEnd;

		marker.setOpacity(0.6);

		marker1._middleRight = marker2._middleLeft = marker;

		onDragStart = function () {
			var i = marker2._index;

			marker._index = i;

			marker
			    .off('click', onClick, this)
			    .on('click', this._onMarkerClick, this);

			latlng.lat = marker.getLatLng().lat;
			latlng.lng = marker.getLatLng().lng;
			this._poly.spliceLatLngs(i, 0, latlng);
			this._markers.splice(i, 0, marker);

			marker.setOpacity(1);

			this._updateIndexes(i, 1);
			marker2._index++;
			this._updatePrevNext(marker1, marker);
			this._updatePrevNext(marker, marker2);

			this._poly.fire('editstart');
		};

		onDragEnd = function () {
			marker.off('dragstart', onDragStart, this);
			marker.off('dragend', onDragEnd, this);

			this._createMiddleMarker(marker1, marker);
			this._createMiddleMarker(marker, marker2);
		};

		onClick = function () {
			onDragStart.call(this);
			onDragEnd.call(this);
			this._fireEdit();
		};

		marker
		    .on('click', onClick, this)
		    .on('dragstart', onDragStart, this)
		    .on('dragend', onDragEnd, this);

		this._markerGroup.addLayer(marker);
	},

	_updatePrevNext: function (marker1, marker2) {
		if (marker1) {
			marker1._next = marker2;
		}
		if (marker2) {
			marker2._prev = marker1;
		}
	},

	_getMiddleLatLng: function (marker1, marker2) {
		var map = this._poly._map,
		    p1 = map.project(marker1.getLatLng()),
		    p2 = map.project(marker2.getLatLng());

		return map.unproject(p1._add(p2)._divideBy(2));
	}
});

L.Polyline.addInitHook(function () {

	// Check to see if handler has already been initialized. This is to support versions of Leaflet that still have L.Handler.PolyEdit
	if (this.editing) {
		return;
	}

	if (L.Edit.Poly) {
		this.editing = new L.Edit.Poly(this);

		if (this.options.editable) {
			this.editing.enable();
		}
	}

	this.on('add', function () {
		if (this.editing && this.editing.enabled()) {
			this.editing.addHooks();
		}
	});

	this.on('remove', function () {
		if (this.editing && this.editing.enabled()) {
			this.editing.removeHooks();
		}
	});
});


L.Edit = L.Edit || {};

L.Edit.SimpleShape = L.Handler.extend({
	options: {
		moveIcon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon leaflet-edit-move'
		}),
		resizeIcon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon leaflet-edit-resize'
		})
	},

	initialize: function (shape, options) {
		this._shape = shape;
		L.Util.setOptions(this, options);
	},

	addHooks: function () {
		if (this._shape._map) {
			this._map = this._shape._map;

			if (!this._markerGroup) {
				this._initMarkers();
			}
			this._map.addLayer(this._markerGroup);
		}
	},

	removeHooks: function () {
		if (this._shape._map) {
			this._unbindMarker(this._moveMarker);

			for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
				this._unbindMarker(this._resizeMarkers[i]);
			}
			this._resizeMarkers = null;

			this._map.removeLayer(this._markerGroup);
			delete this._markerGroup;
		}

		this._map = null;
	},

	updateMarkers: function () {
		this._markerGroup.clearLayers();
		this._initMarkers();
	},

	_initMarkers: function () {
		if (!this._markerGroup) {
			this._markerGroup = new L.LayerGroup();
		}

		// Create center marker
		this._createMoveMarker();

		// Create edge marker
		this._createResizeMarker();
	},

	_createMoveMarker: function () {
		// Children override
	},

	_createResizeMarker: function () {
		// Children override
	},

	_createMarker: function (latlng, icon) {
		var marker = new L.Marker(latlng, {
			draggable: true,
			icon: icon,
			zIndexOffset: 10
		});

		this._bindMarker(marker);

		this._markerGroup.addLayer(marker);

		return marker;
	},

	_bindMarker: function (marker) {
		marker
			.on('dragstart', this._onMarkerDragStart, this)
			.on('drag', this._onMarkerDrag, this)
			.on('dragend', this._onMarkerDragEnd, this);
	},

	_unbindMarker: function (marker) {
		marker
			.off('dragstart', this._onMarkerDragStart, this)
			.off('drag', this._onMarkerDrag, this)
			.off('dragend', this._onMarkerDragEnd, this);
	},

	_onMarkerDragStart: function (e) {
		var marker = e.target;
		marker.setOpacity(0);

		this._shape.fire('editstart');
		this._map.fire('editstart');
	},

	_fireEdit: function () {
		this._shape.edited = true;
		this._shape.fire('edit');
		this._map.fire('edit');
	},

	_onMarkerDrag: function (e) {
		var marker = e.target,
			latlng = marker.getLatLng();

		if (marker === this._moveMarker) {
			this._move(latlng);
		} else {
			this._resize(latlng);
		}
		this._shape.redraw();
	},

	_onMarkerDragEnd: function (e) {
		var marker = e.target;
		marker.setOpacity(1);

		this._fireEdit();
	},

	_move: function () {
		// Children override
	},

	_resize: function () {
		// Children override
	}
});


L.Edit = L.Edit || {};

L.Edit.Rectangle = L.Edit.SimpleShape.extend({
	_zoomToResize: function (e) {
		var marker = e.target,
			latlng = marker.getLatLng();
		var zoom = this._shape._zoom;
		var map = this._map;
		setTimeout(function () {
			map.setZoomAround(latlng, zoom);
		}, 0);
	},

	addHooks: function () {
		L.Edit.SimpleShape.prototype.addHooks.call(this);
		for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
			var bindmarker = this._resizeMarkers[i];
			bindmarker.on('mousedown', this._zoomToResize, this);
		}

	},
	removeHooks: function () {
		for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
			var bindmarker = this._resizeMarkers[i];
			bindmarker.off('mousedown', this._zoomToResize, this);
		}
		L.Edit.SimpleShape.prototype.removeHooks.call(this);
	},
	//patch for rectangles moving size when translated
	_createMoveMarker: function () {
		var bounds = this._shape.getBounds(),
			center = this._map.getRealCenter(bounds);

		this._moveMarker = this._createMarker(center, this.options.moveIcon);
	},

	_createResizeMarker: function () {
		var corners = this._getCorners();

		this._resizeMarkers = [];

		for (var i = 0, l = corners.length; i < l; i++) {
			this._resizeMarkers.push(this._createMarker(corners[i], this.options.resizeIcon));
			// Monkey in the corner index as we will need to know this for dragging
			this._resizeMarkers[i]._cornerIndex = i;
		}
	},

	_onMarkerDragStart: function (e) {
		// this._map.addLayer(this._shape._icon);
		L.Edit.SimpleShape.prototype._onMarkerDragStart.call(this, e);

		// Save a reference to the opposite point
		var corners = this._getCorners(),
			marker = e.target,
			currentCornerIndex = marker._cornerIndex;

		this._oppositeCorner = corners[(currentCornerIndex + 2) % 4];

		this._toggleCornerMarkers(0, currentCornerIndex);
	},

	_onMarkerDragEnd: function (e) {
		var marker = e.target,
			bounds, center;

		// Reset move marker position to the center
		if (marker === this._moveMarker) {
			bounds = this._shape.getBounds();
			center = this._map.getRealCenter(bounds);

			marker.setLatLng(center);
		}

		this._toggleCornerMarkers(1);

		this._repositionCornerMarkers();

		L.Edit.SimpleShape.prototype._onMarkerDragEnd.call(this, e);
		this._shape.view.finalize();
		// this._map.removeLayer(this._shape._icon);
	},

	_move: function (newCenter) {
		var bounds = this._shape.getBounds(),
			offset, newLatLngs = [];

		var northEast = this._map.project(bounds._northEast),
			southWest = this._map.project(bounds._southWest),
			projectedCenter = new L.Point((northEast.x + southWest.x) / 2, (northEast.y + southWest.y) / 2),
			projectedNewCenter = this._map.project(newCenter);
		var latlngs = [bounds.getSouthWest(), bounds.getNorthEast()];

		// Offset the latlngs to the new center
		for (var i = 0, l = latlngs.length; i < l; i++) {
			var current = this._map.project(latlngs[i]);
			offset = [current.x - projectedCenter.x, current.y - projectedCenter.y];
			newLatLngs.push(this._map.unproject([projectedNewCenter.x + offset[0], projectedNewCenter.y + offset[1]]));
		}
		this._shape.view.setBounds(L.latLngBounds(newLatLngs));

		// Reposition the resize markers
		this._repositionCornerMarkers();
	},

	_resize: function (latlng) {
		var roundedBounds = this._map._roundLatlng(this._moveMarker.getLatLng(), latlng, 5, 20, this._shape._zoom);
		this._shape.view.setBounds(L.latLngBounds(roundedBounds[0], roundedBounds[1]));

		// Reposition the move marker
		var bounds = this._shape.getBounds();
		this._moveMarker.setLatLng(this._map.getRealCenter(bounds));
	},

	_getCorners: function () {
		var bounds = this._shape.getBounds(),
			nw = bounds.getNorthWest(),
			ne = bounds.getNorthEast(),
			se = bounds.getSouthEast(),
			sw = bounds.getSouthWest();

		return [nw, ne, se, sw];
	},

	_toggleCornerMarkers: function (opacity) {
		for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
			this._resizeMarkers[i].setOpacity(opacity);
		}
	},

	_repositionCornerMarkers: function () {
		var corners = this._getCorners();

		for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
			this._resizeMarkers[i].setLatLng(corners[i]);
		}
	}
});

L.Rectangle.addInitHook(function () {
	if (L.Edit.Rectangle) {
		this.editing = new L.Edit.Rectangle(this);

		if (this.options.editable) {
			this.editing.enable();
		}
	}
});


L.Edit = L.Edit || {};

L.Edit.Circle = L.Edit.SimpleShape.extend({
	_createMoveMarker: function () {
		var center = this._shape.getLatLng();

		this._moveMarker = this._createMarker(center, this.options.moveIcon);
	},

	_createResizeMarker: function () {
		var center = this._shape.getLatLng(),
			resizemarkerPoint = this._getResizeMarkerPoint(center);

		this._resizeMarkers = [];
		this._resizeMarkers.push(this._createMarker(resizemarkerPoint, this.options.resizeIcon));
	},

	_getResizeMarkerPoint: function (latlng) {
		// From L.shape.getBounds()
		var delta = this._shape._radius * Math.cos(Math.PI / 4),
			point = this._map.project(latlng);
		return this._map.unproject([point.x + delta, point.y - delta]);
	},

	_move: function (latlng) {
		var resizemarkerPoint = this._getResizeMarkerPoint(latlng);

		// Move the resize marker
		this._resizeMarkers[0].setLatLng(resizemarkerPoint);

		// Move the circle
		this._shape.setLatLng(latlng);
	},

	_resize: function (latlng) {
		var moveLatLng = this._moveMarker.getLatLng(),
			radius = moveLatLng.distanceTo(latlng);

		this._shape.setRadius(radius);
	}
});

L.Circle.addInitHook(function () {
	if (L.Edit.Circle) {
		this.editing = new L.Edit.Circle(this);

		if (this.options.editable) {
			this.editing.enable();
		}
	}

	this.on('add', function () {
		if (this.editing && this.editing.enabled()) {
			this.editing.addHooks();
		}
	});

	this.on('remove', function () {
		if (this.editing && this.editing.enabled()) {
			this.editing.removeHooks();
		}
	});
});

/*
 * L.LatLngUtil contains different utility functions for LatLngs.
 */

L.LatLngUtil = {
	// Clones a LatLngs[], returns [][]
	cloneLatLngs: function (latlngs) {
		var clone = [];
		for (var i = 0, l = latlngs.length; i < l; i++) {
			clone.push(this.cloneLatLng(latlngs[i]));
		}
		return clone;
	},

	cloneLatLng: function (latlng) {
		return L.latLng(latlng.lat, latlng.lng);
	}
};

L.GeometryUtil = L.extend(L.GeometryUtil || {}, {
	// Ported from the OpenLayers implementation. See https://github.com/openlayers/openlayers/blob/master/lib/OpenLayers/Geometry/LinearRing.js#L270
	geodesicArea: function (latLngs) {
		var pointsCount = latLngs.length,
			area = 0.0,
			d2r = L.LatLng.DEG_TO_RAD,
			p1, p2;

		if (pointsCount > 2) {
			for (var i = 0; i < pointsCount; i++) {
				p1 = latLngs[i];
				p2 = latLngs[(i + 1) % pointsCount];
				area += ((p2.lng - p1.lng) * d2r) *
						(2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
			}
			area = area * 6378137.0 * 6378137.0 / 2.0;
		}

		return Math.abs(area);
	},

	readableArea: function (area, isMetric) {
		var areaStr;

		if (isMetric) {
			if (area >= 10000) {
				areaStr = (area * 0.0001).toFixed(2) + ' ha';
			} else {
				areaStr = area.toFixed(2) + ' m&sup2;';
			}
		} else {
			area *= 0.836127; // Square yards in 1 meter

			if (area >= 3097600) { //3097600 square yards in 1 square mile
				areaStr = (area / 3097600).toFixed(2) + ' mi&sup2;';
			} else if (area >= 4840) {//48040 square yards in 1 acre
				areaStr = (area / 4840).toFixed(2) + ' acres';
			} else {
				areaStr = Math.ceil(area) + ' yd&sup2;';
			}
		}

		return areaStr;
	},

	readableDistance: function (distance, isMetric) {
		var distanceStr;

		if (isMetric) {
			// show metres when distance is < 1km, then show km
			if (distance > 1000) {
				distanceStr = (distance  / 1000).toFixed(2) + ' km';
			} else {
				distanceStr = Math.ceil(distance) + ' m';
			}
		} else {
			distance *= 1.09361;

			if (distance > 1760) {
				distanceStr = (distance / 1760).toFixed(2) + ' miles';
			} else {
				distanceStr = Math.ceil(distance) + ' yd';
			}
		}

		return distanceStr;
	}
});

L.Util.extend(L.LineUtil, {
	// Checks to see if two line segments intersect. Does not handle degenerate cases.
	// http://compgeom.cs.uiuc.edu/~jeffe/teaching/373/notes/x06-sweepline.pdf
	segmentsIntersect: function (/*Point*/ p, /*Point*/ p1, /*Point*/ p2, /*Point*/ p3) {
		return	this._checkCounterclockwise(p, p2, p3) !==
				this._checkCounterclockwise(p1, p2, p3) &&
				this._checkCounterclockwise(p, p1, p2) !==
				this._checkCounterclockwise(p, p1, p3);
	},

	// check to see if points are in counterclockwise order
	_checkCounterclockwise: function (/*Point*/ p, /*Point*/ p1, /*Point*/ p2) {
		return (p2.y - p.y) * (p1.x - p.x) > (p1.y - p.y) * (p2.x - p.x);
	}
});

L.Polyline.include({
	// Check to see if this polyline has any linesegments that intersect.
	// NOTE: does not support detecting intersection for degenerate cases.
	intersects: function () {
		var points = this._originalPoints,
			len = points ? points.length : 0,
			i, p, p1;

		if (this._tooFewPointsForIntersection()) {
			return false;
		}

		for (i = len - 1; i >= 3; i--) {
			p = points[i - 1];
			p1 = points[i];


			if (this._lineSegmentsIntersectsRange(p, p1, i - 2)) {
				return true;
			}
		}

		return false;
	},

	// Check for intersection if new latlng was added to this polyline.
	// NOTE: does not support detecting intersection for degenerate cases.
	newLatLngIntersects: function (latlng, skipFirst) {
		// Cannot check a polyline for intersecting lats/lngs when not added to the map
		if (!this._map) {
			return false;
		}

		return this.newPointIntersects(this._map.latLngToLayerPoint(latlng), skipFirst);
	},

	// Check for intersection if new point was added to this polyline.
	// newPoint must be a layer point.
	// NOTE: does not support detecting intersection for degenerate cases.
	newPointIntersects: function (newPoint, skipFirst) {
		var points = this._originalPoints,
			len = points ? points.length : 0,
			lastPoint = points ? points[len - 1] : null,
			// The previous previous line segment. Previous line segment doesn't need testing.
			maxIndex = len - 2;

		if (this._tooFewPointsForIntersection(1)) {
			return false;
		}

		return this._lineSegmentsIntersectsRange(lastPoint, newPoint, maxIndex, skipFirst ? 1 : 0);
	},

	// Polylines with 2 sides can only intersect in cases where points are collinear (we don't support detecting these).
	// Cannot have intersection when < 3 line segments (< 4 points)
	_tooFewPointsForIntersection: function (extraPoints) {
		var points = this._originalPoints,
			len = points ? points.length : 0;
		// Increment length by extraPoints if present
		len += extraPoints || 0;

		return !this._originalPoints || len <= 3;
	},

	// Checks a line segment intersections with any line segments before its predecessor.
	// Don't need to check the predecessor as will never intersect.
	_lineSegmentsIntersectsRange: function (p, p1, maxIndex, minIndex) {
		var points = this._originalPoints,
			p2, p3;

		minIndex = minIndex || 0;

		// Check all previous line segments (beside the immediately previous) for intersections
		for (var j = maxIndex; j > minIndex; j--) {
			p2 = points[j - 1];
			p3 = points[j];

			if (L.LineUtil.segmentsIntersect(p, p1, p2, p3)) {
				return true;
			}
		}

		return false;
	}
});


L.Polygon.include({
	// Checks a polygon for any intersecting line segments. Ignores holes.
	intersects: function () {
		var polylineIntersects,
			points = this._originalPoints,
			len, firstPoint, lastPoint, maxIndex;

		if (this._tooFewPointsForIntersection()) {
			return false;
		}

		polylineIntersects = L.Polyline.prototype.intersects.call(this);

		// If already found an intersection don't need to check for any more.
		if (polylineIntersects) {
			return true;
		}

		len = points.length;
		firstPoint = points[0];
		lastPoint = points[len - 1];
		maxIndex = len - 2;

		// Check the line segment between last and first point. Don't need to check the first line segment (minIndex = 1)
		return this._lineSegmentsIntersectsRange(lastPoint, firstPoint, maxIndex, 1);
	}
});

L.Handler.PolyDrag = L.Handler.extend({
    initialize: function (poly) {
        this._poly = poly;
    },

    addHooks: function () {
        var container = this._poly._container;
        if (!this._draggable) {
            this._draggable = new L.Draggable(container, container);
		}

        this._draggable.on({
                dragstart: this._onDragStart,
                drag: this._onDrag,
                dragend: this._onDragEnd
            }, this).enable();

        L.DomUtil.addClass(container, 'leaflet-polyline-draggable');
    },

    removeHooks: function () {
	    this._draggable.off({
	        dragstart: this._onDragStart,
	        drag: this._onDrag,
	        dragend: this._onDragEnd
		}, this).disable();

        L.DomUtil.removeClass(this._poly._container, 'leaflet-polyline-draggable');
    },

    moved: function () {
        return this._draggable && this._draggable._moved;
    },

    _onDragStart: function () {
        if (this._poly.editing.enabled()) {
            this._wasEditing = true;
            this._poly.editing.disable();
        }
        var map = this._poly._map;
        map.fire('polyDragStart');
        L.DomUtil.setPosition(this._poly._container, new L.Point(0, 0));
        this._poly
            .fire('movestart')
            .fire('dragstart');
    },

    _onDrag: function () {
        this._poly
            .fire('move')
            .fire('drag');
    },

    _onDragEnd: function (e) {
        var map = this._poly._map;
        var oldLatLngs = this._poly.getLatLngs();
        var newLatLngs = [];
        var i;
        for (i in oldLatLngs) {
            var oldContainerPoint = map.latLngToContainerPoint(oldLatLngs[i]);
            var newContainerPoint =
                oldContainerPoint.add(e.target._newPos.subtract(e.target._startPos));
            newLatLngs.push(map.containerPointToLatLng(newContainerPoint));
        }
        L.DomUtil.setPosition(this._poly._container, new L.Point(0, 0));
        this._poly.setLatLngs(newLatLngs);
        if (this._wasEditing) {
            this._poly.editing.enable();
            this._wasEditing = false;
            this._poly.edited = true;
        }
        this._poly
            .fire('moveend')
            .fire('dragend');
        map.fire('polyDragEnd');
    }
});

L.Polyline.addInitHook(function () {

	// Check to see if handler has already been initialized. This is to support versions of Leaflet that still have L.Handler.PolyEdit
	if (this.dragging) {
		return;
	}

	if (L.Handler.PolyDrag) {
		this.dragging = new L.Handler.PolyDrag(this);
	}
});

L.Control.Draw = L.Control.extend({

	options: {
		position: 'topleft',
		draw: {},
		edit: false
	},

	initialize: function (options) {
		if (L.version < '0.7') {
			throw new Error('Leaflet.draw 0.2.3+ requires Leaflet 0.7.0+. Download latest from https://github.com/Leaflet/Leaflet/');
		}

		L.Control.prototype.initialize.call(this, options);

		var id, toolbar;

		this._toolbars = {};

		// Initialize toolbars
		if (L.SettingsToolbar && this.options.settings) {
			toolbar = new L.SettingsToolbar(this.options.settings);
			id = L.stamp(toolbar);
			this._toolbars[id] = toolbar;

			// Listen for when toolbar is enabled
			this._toolbars[id].on('enable', this._toolbarEnabled, this);
		}

		if (L.EditToolbar && this.options.edit) {
			toolbar = new L.EditToolbar(this.options.edit);
			id = L.stamp(toolbar);
			this._toolbars[id] = toolbar;

			// Listen for when toolbar is enabled
			this._toolbars[id].on('enable', this._toolbarEnabled, this);
		}

		if (L.DrawToolbar && this.options.draw) {
			toolbar = new L.DrawToolbar(this.options.draw);
			id = L.stamp(toolbar);
			this._toolbars[id] = toolbar;

			// Listen for when toolbar is enabled
			this._toolbars[id].on('enable', this._toolbarEnabled, this);
		}

		if (L.ViewToolbar && this.options.draw) {
			toolbar = new L.ViewToolbar(this.options.draw);
			id = L.stamp(toolbar);
			this._toolbars[id] = toolbar;

			// Listen for when toolbar is enabled
			this._toolbars[id].on('enable', this._toolbarEnabled, this);
		}

		if (L.SearchToolbar && this.options.search) {
			toolbar = new L.SearchToolbar(this.options.search);
			id = L.stamp(toolbar);
			this._toolbars[id] = toolbar;

			// Listen for when toolbar is enabled
			this._toolbars[id].on('enable', this._toolbarEnabled, this);
		}
	},

	onAdd: function (map) {
		var container = L.DomUtil.create('div', 'leaflet-draw'),
			addedTopClass = false,
			topClassName = 'leaflet-draw-toolbar-top',
			toolbarContainer;

		for (var toolbarId in this._toolbars) {
			if (this._toolbars.hasOwnProperty(toolbarId)) {
				toolbarContainer = this._toolbars[toolbarId].addToolbar(map);

				if (toolbarContainer) {
					// Add class to the first toolbar to remove the margin
					if (!addedTopClass) {
						if (!L.DomUtil.hasClass(toolbarContainer, topClassName)) {
							L.DomUtil.addClass(toolbarContainer.childNodes[0], topClassName);
						}
						addedTopClass = true;
					}

					container.appendChild(toolbarContainer);
				}
			}
		}

		return container;
	},

	onRemove: function () {
		for (var toolbarId in this._toolbars) {
			if (this._toolbars.hasOwnProperty(toolbarId)) {
				this._toolbars[toolbarId].removeToolbar();
			}
		}
	},

	setDrawingOptions: function (options) {
		for (var toolbarId in this._toolbars) {
			if (this._toolbars[toolbarId] instanceof L.DrawToolbar) {
				this._toolbars[toolbarId].setOptions(options);
			}
		}
	},

	_toolbarEnabled: function (e) {
		var id = '' + L.stamp(e.target);

		for (var toolbarId in this._toolbars) {
			if (this._toolbars.hasOwnProperty(toolbarId) && toolbarId !== id) {
				this._toolbars[toolbarId].disable();
			}
		}
	}
});

L.Map.mergeOptions({
	drawControlTooltips: true,
	drawControl: false
});

L.Map.addInitHook(function () {
	if (this.options.drawControl) {
		this.drawControl = new L.Control.Draw();
		this.addControl(this.drawControl);
	}
});


L.Toolbar = L.Class.extend({
	includes: [L.Mixin.Events],

	initialize: function (options) {
		L.setOptions(this, options);

		this._modes = {};
		this._actionButtons = [];
		this._activeMode = null;
	},

	enabled: function () {
		return this._activeMode !== null;
	},

	disable: function () {
		if (!this.enabled()) { return; }

		this._activeMode.handler.disable();
	},

	addToolbar: function (map) {
		var container = L.DomUtil.create('div', 'leaflet-draw-section'),
			buttonIndex = 0,
			buttonClassPrefix = this._toolbarClass || '',
			modeHandlers = this.getModeHandlers(map),
			i;

		this._toolbarContainer = L.DomUtil.create('div', 'leaflet-draw-toolbar leaflet-bar');
		this._map = map;

		for (i = 0; i < modeHandlers.length; i++) {
			if (modeHandlers[i].enabled) {
				this._initModeHandler(
					modeHandlers[i].handler,
					this._toolbarContainer,
					buttonIndex++,
					buttonClassPrefix,
					modeHandlers[i].title
				);
			}
		}

		// if no buttons were added, do not add the toolbar
		if (!buttonIndex) {
			return;
		}

		// Save button index of the last button, -1 as we would have ++ after the last button
		this._lastButtonIndex = --buttonIndex;

		// Create empty actions part of the toolbar
		this._actionsContainer = L.DomUtil.create('ul', 'leaflet-draw-actions');

		// Add draw and cancel containers to the control container
		container.appendChild(this._toolbarContainer);
		container.appendChild(this._actionsContainer);

		return container;
	},

	removeToolbar: function () {
		// Dispose each handler
		for (var handlerId in this._modes) {
			if (this._modes.hasOwnProperty(handlerId)) {
				// Unbind handler button
				this._disposeButton(
					this._modes[handlerId].button,
					this._modes[handlerId].handler.enable,
					this._modes[handlerId].handler
				);

				// Make sure is disabled
				this._modes[handlerId].handler.disable();

				// Unbind handler
				this._modes[handlerId].handler
					.off('enabled', this._handlerActivated, this)
					.off('disabled', this._handlerDeactivated, this);
			}
		}
		this._modes = {};

		// Dispose the actions toolbar
		for (var i = 0, l = this._actionButtons.length; i < l; i++) {
			this._disposeButton(
				this._actionButtons[i].button,
				this._actionButtons[i].callback,
				this
			);
		}
		this._actionButtons = [];
		this._actionsContainer = null;
	},

	_initModeHandler: function (handler, container, buttonIndex, classNamePredix, buttonTitle) {
		var type = handler.type;

		this._modes[type] = {};

		this._modes[type].handler = handler;

		this._modes[type].button = this._createButton({
			title: buttonTitle,
			className: classNamePredix + '-' + type,
			container: container,
			callback: this._modes[type].handler.enable,
			context: this._modes[type].handler
		});

		this._modes[type].buttonIndex = buttonIndex;

		this._modes[type].handler
			.on('enabled', this._handlerActivated, this)
			.on('disabled', this._handlerDeactivated, this);
	},

	_createButton: function (options) {
		var link = L.DomUtil.create('a', options.className || '', options.container);
		link.href = '#';

		if (options.text) {
			link.innerHTML = options.text;
		}

		if (options.title) {
			link.title = options.title;
		}

		L.DomEvent
			.on(link, 'click', L.DomEvent.stopPropagation)
			.on(link, 'mousedown', L.DomEvent.stopPropagation)
			.on(link, 'dblclick', L.DomEvent.stopPropagation)
			.on(link, 'click', L.DomEvent.preventDefault)
			.on(link, 'click', options.callback, options.context);

		return link;
	},

	_disposeButton: function (button, callback) {
		L.DomEvent
			.off(button, 'click', L.DomEvent.stopPropagation)
			.off(button, 'mousedown', L.DomEvent.stopPropagation)
			.off(button, 'dblclick', L.DomEvent.stopPropagation)
			.off(button, 'click', L.DomEvent.preventDefault)
			.off(button, 'click', callback);
	},

	_handlerActivated: function (e) {
		// Disable active mode (if present)
		this.disable();

		// Cache new active feature
		this._activeMode = this._modes[e.handler];

		L.DomUtil.addClass(this._activeMode.button, 'leaflet-draw-toolbar-button-enabled');

		this._showActionsToolbar();

		this.fire('enable');
	},

	_handlerDeactivated: function () {
		this._hideActionsToolbar();

		L.DomUtil.removeClass(this._activeMode.button, 'leaflet-draw-toolbar-button-enabled');

		this._activeMode = null;

		this.fire('disable');
	},

	_createActions: function (handler) {
		var container = this._actionsContainer,
			buttons = this.getActions(handler),
			l = buttons.length,
			li, di, dl, button;

		// Dispose the actions toolbar (todo: dispose only not used buttons)
		for (di = 0, dl = this._actionButtons.length; di < dl; di++) {
			this._disposeButton(this._actionButtons[di].button, this._actionButtons[di].callback);
		}
		this._actionButtons = [];

		// Remove all old buttons
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		for (var i = 0; i < l; i++) {
			if ('enabled' in buttons[i] && !buttons[i].enabled) {
				continue;
			}

			li = L.DomUtil.create('li', '', container);

			button = this._createButton({
				title: buttons[i].title,
				text: buttons[i].text,
				container: li,
				callback: buttons[i].callback,
				context: buttons[i].context
			});

			this._actionButtons.push({
				button: button,
				callback: buttons[i].callback
			});
		}
	},

	_showActionsToolbar: function () {
		var buttonIndex = this._activeMode.buttonIndex,
			lastButtonIndex = this._lastButtonIndex,
			toolbarPosition = this._activeMode.button.offsetTop - 1;

		// Recreate action buttons on every click
		this._createActions(this._activeMode.handler);

		// Correctly position the cancel button
		this._actionsContainer.style.top = toolbarPosition + 'px';

		if (buttonIndex === 0) {
			L.DomUtil.addClass(this._toolbarContainer, 'leaflet-draw-toolbar-notop');
			L.DomUtil.addClass(this._actionsContainer, 'leaflet-draw-actions-top');
		}

		if (buttonIndex === lastButtonIndex) {
			L.DomUtil.addClass(this._toolbarContainer, 'leaflet-draw-toolbar-nobottom');
			L.DomUtil.addClass(this._actionsContainer, 'leaflet-draw-actions-bottom');
		}

		this._actionsContainer.style.display = 'block';
	},

	_hideActionsToolbar: function () {
		this._actionsContainer.style.display = 'none';

		L.DomUtil.removeClass(this._toolbarContainer, 'leaflet-draw-toolbar-notop');
		L.DomUtil.removeClass(this._toolbarContainer, 'leaflet-draw-toolbar-nobottom');
		L.DomUtil.removeClass(this._actionsContainer, 'leaflet-draw-actions-top');
		L.DomUtil.removeClass(this._actionsContainer, 'leaflet-draw-actions-bottom');
	}
});


L.Tooltip = L.Class.extend({
	initialize: function (map) {
		this._map = map;
		this._popupPane = map._panes.popupPane;

		this._container = map.options.drawControlTooltips ? L.DomUtil.create('div', 'leaflet-draw-tooltip', this._popupPane) : null;
		this._singleLineLabel = false;
	},

	dispose: function () {
		if (this._container) {
			this._popupPane.removeChild(this._container);
			this._container = null;
		}
	},

	updateContent: function (labelText) {
		if (!this._container) {
			return this;
		}
		labelText.subtext = labelText.subtext || '';

		// update the vertical position (only if changed)
		if (labelText.subtext.length === 0 && !this._singleLineLabel) {
			L.DomUtil.addClass(this._container, 'leaflet-draw-tooltip-single');
			this._singleLineLabel = true;
		}
		else if (labelText.subtext.length > 0 && this._singleLineLabel) {
			L.DomUtil.removeClass(this._container, 'leaflet-draw-tooltip-single');
			this._singleLineLabel = false;
		}

		this._container.innerHTML =
			(labelText.subtext.length > 0 ? '<span class="leaflet-draw-tooltip-subtext">' + labelText.subtext + '</span>' + '<br />' : '') +
			'<span>' + labelText.text + '</span>';

		return this;
	},

	updatePosition: function (latlng) {
		var pos = this._map.latLngToLayerPoint(latlng),
			tooltipContainer = this._container;

		if (this._container) {
			tooltipContainer.style.visibility = 'inherit';
			L.DomUtil.setPosition(tooltipContainer, pos);
		}

		return this;
	},

	showAsError: function () {
		if (this._container) {
			L.DomUtil.addClass(this._container, 'leaflet-error-draw-tooltip');
		}
		return this;
	},

	removeError: function () {
		if (this._container) {
			L.DomUtil.removeClass(this._container, 'leaflet-error-draw-tooltip');
		}
		return this;
	}
});

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


L.ViewToolbar = L.DrawToolbar.extend({
	getModeHandlers: function (map) {
		var viewLayer = this.options.viewLayer;

		return [
			{
				enabled: this.options.rectangle,
				handler: new L.Draw.Rectangle(map, this.options.rectangle, viewLayer),
				title: L.drawLocal.draw.toolbar.buttons.rectangle
			}
		];
	}
});

/*L.Map.mergeOptions({
	editControl: true
});*/

L.EditToolbar = L.Toolbar.extend({
	options: {
		edit: {
			selectedPathOptions: {
				color: '#fe57a1', /* Hot pink all the things! */
				opacity: 0.6,
				dashArray: '10, 10',

				fill: true,
				fillColor: '#fe57a1',
				fillOpacity: 0.1
			}
		},
		remove: {},
		featureGroup: null /* REQUIRED! TODO: perhaps if not set then all layers on the map are selectable? */
	},

	initialize: function (options) {
		// Need to set this manually since null is an acceptable value here
		if (options.edit) {
			if (typeof options.edit.selectedPathOptions === 'undefined') {
				options.edit.selectedPathOptions = this.options.edit.selectedPathOptions;
			}
			options.edit = L.extend({}, this.options.edit, options.edit);
		}

		if (options.remove) {
			options.remove = L.extend({}, this.options.remove, options.remove);
		}

		if (options.style) {
			options.style = L.extend({}, this.options.style, options.style);
		}

		this._toolbarClass = 'leaflet-draw-edit';
		L.Toolbar.prototype.initialize.call(this, options);

		this._selectedFeatureCount = 0;
	},

	getModeHandlers: function (map) {
		var featureGroup = this.options.featureGroup;
		return [
			{
				enabled: this.options.edit,
				handler: new L.EditToolbar.Edit(map, {
					featureGroup: featureGroup,
					selectedPathOptions: this.options.edit.selectedPathOptions
				}),
				title: L.drawLocal.edit.toolbar.buttons.edit
			},
			{
				enabled: this.options.navigate,
				handler: new L.EditToolbar.Navigate(map, {}),
				title: L.drawLocal.edit.toolbar.buttons.navigate
			},
			{
				enabled: this.options.remove,
				handler: new L.EditToolbar.Delete(map, {
					featureGroup: featureGroup
				}),
				title: L.drawLocal.edit.toolbar.buttons.remove
			},
			{
				enabled: this.options.style,
				handler: new L.EditToolbar.Style(map, {
					featureGroup: featureGroup,
					panel: this.options.style.panel
				}),
				title: L.drawLocal.edit.toolbar.buttons.style
			}
		];
	},

	getActions: function () {
		return [];
	},

	addToolbar: function (map) {
		var container = L.Toolbar.prototype.addToolbar.call(this, map);

		this._checkDisabled();

		this.options.featureGroup.on('layeradd layerremove', this._checkDisabled, this);
		if (this._modes.navigate) {
			var self = this;
			map.on('navigation', function () {
				self._modes.navigate.handler.enable();
			});
		}
		return container;
	},

	removeToolbar: function () {
		this.options.featureGroup.off('layeradd layerremove', this._checkDisabled, this);

		L.Toolbar.prototype.removeToolbar.call(this);
	},
	cancel: function () {
		if (!this.enabled()) { return; }
		this._activeMode.handler.revertLayers();
	},
	disable: function () {
		if (!this.enabled()) { return; }

		this._activeMode.handler.save();
		L.Toolbar.prototype.disable.call(this);
	},

	_save: function () {
		this._activeMode.handler.save();
	},

	_checkDisabled: function () {
		// var featureGroup = this.options.featureGroup;
		var hasLayers = true,//featureGroup.getLayers().length !== 0,
			button;

		if (this.options.edit) {
			button = this._modes[L.EditToolbar.Edit.TYPE].button;

			if (hasLayers) {
				L.DomUtil.removeClass(button, 'leaflet-disabled');
			} else {
				L.DomUtil.addClass(button, 'leaflet-disabled');
			}

			button.setAttribute(
				'title',
				hasLayers ?
				L.drawLocal.edit.toolbar.buttons.edit
				: L.drawLocal.edit.toolbar.buttons.editDisabled
			);
		}

		if (this.options.remove) {
			button = this._modes[L.EditToolbar.Delete.TYPE].button;

			if (hasLayers) {
				L.DomUtil.removeClass(button, 'leaflet-disabled');
			} else {
				L.DomUtil.addClass(button, 'leaflet-disabled');
			}

			button.setAttribute(
				'title',
				hasLayers ?
				L.drawLocal.edit.toolbar.buttons.remove
				: L.drawLocal.edit.toolbar.buttons.removeDisabled
			);
		}
		if (this.options.style) {
			button = this._modes[L.EditToolbar.Style.TYPE].button;

			if (hasLayers) {
				L.DomUtil.removeClass(button, 'leaflet-disabled');
			} else {
				L.DomUtil.addClass(button, 'leaflet-disabled');
			}

			button.setAttribute(
				'title',
				hasLayers ?
				L.drawLocal.edit.toolbar.buttons.style
				: L.drawLocal.edit.toolbar.buttons.styleDisabled
			);
		}
	}
});


L.EditToolbar.Edit = L.Handler.extend({
	statics: {
		TYPE: 'edit'
	},

	includes: L.Mixin.Events,

	initialize: function (map, options) {
		L.Handler.prototype.initialize.call(this, map);

		// Set options to the default unless already set
		this._selectedPathOptions = options.selectedPathOptions;

		// Store the selectable layer group for ease of access
		this._featureGroup = options.featureGroup;

		if (!(this._featureGroup instanceof L.FeatureGroup)) {
			throw new Error('options.featureGroup must be a L.FeatureGroup');
		}

		this._uneditedLayerProps = {};

		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.EditToolbar.Edit.TYPE;
	},

	enable: function () {
		if (this._enabled || !this._hasAvailableLayers()) {
			return;
		}
		this.fire('enabled', {handler: this.type});
			//this disable other handlers

		this._map.fire('draw:editstart', { handler: this.type });
			//allow drawLayer to be updated before beginning edition.

		L.Handler.prototype.enable.call(this);
		this._featureGroup
			.on('layeradd', this._enableLayerEdit, this)
			.on('layerremove', this._disableLayerEdit, this);
	},

	disable: function () {
		if (!this._enabled) { return; }
		this._featureGroup
			.off('layeradd', this._enableLayerEdit, this)
			.off('layerremove', this._disableLayerEdit, this);
		L.Handler.prototype.disable.call(this);
		this._map.fire('draw:editstop', { handler: this.type });
		this.fire('disabled', {handler: this.type});
	},

	addHooks: function () {
		var map = this._map;

		if (map) {
			map.getContainer().focus();

			this._featureGroup.eachLayer(this._enableLayerEdit, this);

			this._tooltip = new L.Tooltip(this._map);
			this._tooltip.updateContent({
				text: L.drawLocal.edit.handlers.edit.tooltip.text,
				subtext: L.drawLocal.edit.handlers.edit.tooltip.subtext
			});

			this._map.on('mousemove', this._onMouseMove, this);
		}
	},

	removeHooks: function () {
		if (this._map) {
			// Clean up selected layers.
			this._featureGroup.eachLayer(this._disableLayerEdit, this);

			// Clear the backups of the original layers
			this._uneditedLayerProps = {};

			this._tooltip.dispose();
			this._tooltip = null;

			this._map.off('mousemove', this._onMouseMove, this);
		}
	},

	revertLayers: function () {
		this._featureGroup.eachLayer(function (layer) {
			this._revertLayer(layer);
		}, this);
	},

	save: function () {
		var editedLayers = new L.LayerGroup();
		this._featureGroup.eachLayer(function (layer) {
			if (layer.edited) {
				editedLayers.addLayer(layer);
				layer.edited = false;
			}
		});
		this._map.fire('draw:edited', {layers: editedLayers});
	},

	_backupLayer: function (layer) {
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
				}
			} else if (layer instanceof L.Circle) {
				layer.setLatLng(this._uneditedLayerProps[id].latlng);
				layer.setRadius(this._uneditedLayerProps[id].radius);
			} else { // Marker
				layer.setLatLng(this._uneditedLayerProps[id].latlng);
			}
		}
	},

	_toggleMarkerHighlight: function (marker) {
		if (!marker._icon) {
			return;
		}
		// This is quite naughty, but I don't see another way of doing it. (short of setting a new icon)
		var icon = marker._icon;

		icon.style.display = 'none';

		if (L.DomUtil.hasClass(icon, 'leaflet-edit-marker-selected')) {
			L.DomUtil.removeClass(icon, 'leaflet-edit-marker-selected');
			// Offset as the border will make the icon move.
			this._offsetMarker(icon, -4);

		} else {
			L.DomUtil.addClass(icon, 'leaflet-edit-marker-selected');
			// Offset as the border will make the icon move.
			this._offsetMarker(icon, 4);
		}

		icon.style.display = '';
	},

	_offsetMarker: function (icon, offset) {
		var iconMarginTop = parseInt(icon.style.marginTop, 10) - offset,
			iconMarginLeft = parseInt(icon.style.marginLeft, 10) - offset;

		icon.style.marginTop = iconMarginTop + 'px';
		icon.style.marginLeft = iconMarginLeft + 'px';
	},

	_enableLayerEdit: function (e) {
		var layer = e.layer || e.target || e,
			isMarker = layer instanceof L.Marker,
			pathOptions;

		// Don't do anything if this layer is a marker but doesn't have an icon. Markers
		// should usually have icons. If using Leaflet.draw with Leafler.markercluster there
		// is a chance that a marker doesn't.
		if (isMarker && !layer._icon) {
			return;
		}

		// Back up this layer (if haven't before)
		this._backupLayer(layer);

		// Update layer style so appears editable
		if (this._selectedPathOptions) {
			pathOptions = L.Util.extend({}, this._selectedPathOptions);

			if (isMarker) {
				this._toggleMarkerHighlight(layer);
			} else {
				layer.options.previousOptions = L.Util.extend({ dashArray: null }, layer.options);

				// Make sure that Polylines are not filled
				if (!(layer instanceof L.Circle) && !(layer instanceof L.Polygon) && !(layer instanceof L.Rectangle)) {
					pathOptions.fill = false;
				}

				layer.setStyle(pathOptions);
			}
		}

		if (isMarker) {
			layer.dragging.enable();
			layer.on('dragend', this._onMarkerDragEnd);
		} else {
			layer.editing.enable();
			if (!(layer instanceof L.Rectangle)) {
				if (!layer.dragging) {
					layer.dragging = new L.Handler.PolyDrag(layer);
				}
				layer.dragging.enable();
			}
		}
	},

	_disableLayerEdit: function (e) {
		var layer = e.layer || e.target || e;
		layer.edited = false;

		// Reset layer styles to that of before select
		if (this._selectedPathOptions) {
			if (layer instanceof L.Marker) {
				this._toggleMarkerHighlight(layer);
			} else {
				// reset the layer style to what is was before being selected
				layer.setStyle(layer.options.previousOptions);
				// remove the cached options for the layer object
				delete layer.options.previousOptions;
			}
		}

		if (layer instanceof L.Marker) {
			layer.dragging.disable();
			layer.off('dragend', this._onMarkerDragEnd, this);
		} else {
			layer.editing.disable();
			if (!(layer instanceof L.Rectangle)) {
				layer.dragging.disable();
			}
		}
	},

	_onMarkerDragEnd: function (e) {
		var layer = e.target;
		layer.edited = true;
	},

	_onMouseMove: function (e) {
		this._tooltip.updatePosition(e.latlng);
	},

	_hasAvailableLayers: function () {
		// return this._featureGroup.getLayers().length !== 0;
		return true;
	}
});


L.EditToolbar.Delete = L.Handler.extend({
	statics: {
		TYPE: 'remove' // not delete as delete is reserved in js
	},

	includes: L.Mixin.Events,

	initialize: function (map, options) {
		L.Handler.prototype.initialize.call(this, map);

		L.Util.setOptions(this, options);

		// Store the selectable layer group for ease of access
		this._deletableLayers = this.options.featureGroup;

		if (!(this._deletableLayers instanceof L.FeatureGroup)) {
			throw new Error('options.featureGroup must be a L.FeatureGroup');
		}

		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.EditToolbar.Delete.TYPE;
	},

	enable: function () {
		if (this._enabled || !this._hasAvailableLayers()) {
			return;
		}
		this.fire('enabled', { handler: this.type});
			//this disable other handlers

		this._map.fire('draw:deletestart', { handler: this.type });
			//allow drawLayer to be updated before beginning deletion.

		L.Handler.prototype.enable.call(this);
		this._deletableLayers
			.on('layeradd', this._enableLayerDelete, this)
			.on('layerremove', this._disableLayerDelete, this);
	},

	disable: function () {
		if (!this._enabled) { return; }
		this._deletableLayers
			.off('layeradd', this._enableLayerDelete, this)
			.off('layerremove', this._disableLayerDelete, this);
		L.Handler.prototype.disable.call(this);
		this._map.fire('draw:deletestop', { handler: this.type });
		this.fire('disabled', { handler: this.type});
	},

	addHooks: function () {
		var map = this._map;

		if (map) {
			map.getContainer().focus();

			this._deletableLayers.eachLayer(this._enableLayerDelete, this);
			this._deletedLayers = new L.layerGroup();

			this._tooltip = new L.Tooltip(this._map);
			this._tooltip.updateContent({ text: L.drawLocal.edit.handlers.remove.tooltip.text });

			this._map.on('mousemove', this._onMouseMove, this);
		}
	},

	removeHooks: function () {
		if (this._map) {
			this._deletableLayers.eachLayer(this._disableLayerDelete, this);
			this._deletedLayers = null;

			this._tooltip.dispose();
			this._tooltip = null;

			this._map.off('mousemove', this._onMouseMove, this);
		}
	},

	revertLayers: function () {
		// Iterate of the deleted layers and add them back into the featureGroup
		this._deletedLayers.eachLayer(function (layer) {
			if (layer._rectangle) {
				this._deletableLayers.addLayer(layer._rectangle);
			}
			this._deletableLayers.addLayer(layer);
		}, this);
	},

	save: function () {
		this._map.fire('draw:deleted', { layers: this._deletedLayers });
	},

	_enableLayerDelete: function (e) {
		var layer = e.layer || e.target || e;

		layer.on('click', this._removeLayer, this);
	},

	_disableLayerDelete: function (e) {
		var layer = e.layer || e.target || e;

		layer.off('click', this._removeLayer, this);

		// Remove from the deleted layers so we can't accidently revert if the user presses cancel
		this._deletedLayers.removeLayer(layer);
	},

	_removeLayer: function (e) {
		// var layer = e.layer || e.target || e;
		var layer = e.target || e;
		if (layer._rectangle) {
			this._deletableLayers.removeLayer(layer._rectangle);
		}
		this._deletableLayers.removeLayer(layer);
		this._deletedLayers.addLayer(layer);
	},

	_onMouseMove: function (e) {
		this._tooltip.updatePosition(e.latlng);
	},

	_hasAvailableLayers: function () {
		// return this._deletableLayers.getLayers().length !== 0;
		return true;
	}
});


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
	},
	save: function () {}
});


}(window, document));