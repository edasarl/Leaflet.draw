L.ViewToolbar = L.DrawToolbar.extend({
	getModeHandlers: function (map) {
		var viewLayer = this.options.viewLayer,
			rectangleLayer = this.options.rectangleLayer;

		return [
			{
				enabled: this.options.rectangle,
				handler: new L.Draw.Rectangle(map, this.options.rectangle, viewLayer, rectangleLayer),
				title: L.drawLocal.draw.toolbar.buttons.rectangle
			}
		];
	}
});