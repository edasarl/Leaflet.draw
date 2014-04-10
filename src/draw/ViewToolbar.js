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