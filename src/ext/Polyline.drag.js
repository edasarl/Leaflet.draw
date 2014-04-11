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