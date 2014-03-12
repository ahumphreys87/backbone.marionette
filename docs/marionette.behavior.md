# Marionette.Behavior

A `Behavior` is an encapsulated `View` interaction layer that can be mixed into any `view`. `Behaviors` allow you to blackbox `View` specific interactions into portable logical chunks, keeping your `views` simple and your code DRY. 


## The motivation

As you build more and more complex views you will find that your `view` becomes less about displaying model data, and more about interactions. 

These interaction points tend to live in the `onShow`, `onDomRefresh`, and `events` within your view file. There is no reason for there to be the case. 
 

```
var MyView = Marionette.ItemView.extend({
	events: {
	  "click @ui.close": "warnBeforeClose"  
	},
	
	warnBeforeClose: function() {
	  alert("you are closing all your data is now gone!");
	  this.close();
	},
	
	onShow: function() {
	   this.ui.handle.tooltip({
	     text: "what a nice mouse you have"
	   });
	}
});
```

Interaction points such as tooltips and warning messages are generic concepts. There is no need to recode them within your views. They are prime for abstraction into a higher level non-coupled concept. Those my friend are where `Behaviors` come in.
