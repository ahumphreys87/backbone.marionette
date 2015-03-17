/* jshint maxstatements: 20, maxcomplexity: 7 */

// Collection View
// ---------------

// A view that iterates over a Backbone.Collection
// and renders an individual child view for each model.
Marionette.CollectionView = Marionette.View.extend({

  // used as the prefix for child view events
  // that are forwarded through the collectionview
  childViewEventPrefix: 'childview',

  // flag for maintaining the sorted order of the collection
  sort: true,

  // constructor
  // option to pass `{sort: false}` to prevent the `CollectionView` from
  // maintaining the sorted order of the collection.
  // This will fallback onto appending childView's to the end.
  //
  // option to pass `{comparator: compFunction()}` to allow the `CollectionView`
  // to use a custom sort order for the collection.
  constructor: function(options) {
    this.once('render', this._initialEvents);
    this._initChildViewStorage();

    Marionette.View.apply(this, arguments);

    this.on({
      'before:show':   this._onBeforeShowCalled,
      'show':          this._onShowCalled,
      'before:attach': this._onBeforeAttachCalled,
      'attach':        this._onAttachCalled
    });
    this.initRenderBuffer();
  },

  // Instead of inserting elements one by one into the page,
  // it's much more performant to insert elements into a document
  // fragment and then insert that document fragment into the page
  initRenderBuffer: function() {
    this._bufferedChildren = [];
  },

  startBuffering: function() {
    this.initRenderBuffer();
    this.isBuffering = true;
  },

  endBuffering: function() {
    // Only trigger attach if already shown and attached, otherwise Region#show() handles this.
    var canTriggerAttach = this._isShown && Marionette.isNodeAttached(this.el);
    var nestedViews;

    this.isBuffering = false;

    if (this._isShown) {
      this._triggerMethodMany(this._bufferedChildren, this, 'before:show');
    }
    if (canTriggerAttach && this._triggerBeforeAttach) {
      nestedViews = this._getNestedViews();
      this._triggerMethodMany(nestedViews, this, 'before:attach');
    }

    this.attachBuffer(this, this._createBuffer());

      this.initRenderBuffer();
    }
    this.initRenderBuffer();
  },

  _triggerMethodMany: function(targets, source, eventName) {
    var args = _.drop(arguments, 3);

    _.each(targets, function(target) {
      Marionette.triggerMethodOn.apply(target, [target, eventName, target, source].concat(args));
    });
  },

  // Configured the initial events that the collection view
  // binds to.
  _initialEvents: function() {
    if (this.collection) {
      this.listenTo(this.collection, 'add', this._onCollectionAdd);
      this.listenTo(this.collection, 'remove', this._onCollectionRemove);
      this.listenTo(this.collection, 'reset', this.render);

      if (this.getOption('sort')) {
        this.listenTo(this.collection, 'sort', this._sortViews);
      }
    }
  },

  // Handle a child added to the collection
  _onCollectionAdd: function(child, collection, opts) {
    // `index` is present when adding with `at` since BB 1.2; indexOf fallback for < 1.2
    var index = opts.at !== undefined && (opts.index || collection.indexOf(child));

    // When filtered or when there is no initial index, calculate index.
    if (this.getOption('filter') || index === false) {
      index = _.indexOf(this._filteredSortedModels(index), child);
    }

    if (this._shouldAddChild(child, index)) {
      this.destroyEmptyView();
      var ChildView = this.getChildView(child);
      this.addChild(child, ChildView, index);
    }
  },

  // get the child view by model it holds, and remove it
  _onCollectionRemove: function(model) {
    var view = this.children.findByModel(model);
    this.removeChildView(view);
    this.checkEmpty();
  },

  _onBeforeShowCalled: function() {
    // Reset attach event flags at the top of the Region#show() event lifecycle; if the Region's
    // show() options permit onBeforeAttach/onAttach events, these flags will be set true again.
    this._triggerBeforeAttach = this._triggerAttach = false;
    this.children.each(function(childView) {
      Marionette.triggerMethodOn(childView, 'before:show', childView);
    });
  },

  _onShowCalled: function() {
    this.children.each(function(childView) {
      Marionette.triggerMethodOn(childView, 'show', childView);
    });
  },

  // If during Region#show() onBeforeAttach was fired, continue firing it for child views
  _onBeforeAttachCalled: function() {
    this._triggerBeforeAttach = true;
  },

  // If during Region#show() onAttach was fired, continue firing it for child views
  _onAttachCalled: function() {
    this._triggerAttach = true;
  },

  // Render children views. Override this method to
  // provide your own implementation of a render function for
  // the collection view.
  render: function() {
    this._ensureViewIsIntact();
    this.triggerMethod('before:render', this);
    this._renderChildren();
    this.isRendered = true;
    this.triggerMethod('render', this);
    return this;
  },

  // Reorder DOM after sorting. When your element's rendering
  // do not use their index, you can pass reorderOnSort: true
  // to only reorder the DOM after a sort instead of rendering
  // all the collectionView
  reorder: function() {
    var children = this.children;
    var models = this._filteredSortedModels();

    if (!models.length && this._showingEmptyView) { return this; }

    var anyModelsAdded = _.some(models, function(model) {
      return !children.findByModel(model);
    });

    // If there are any new models added due to filtering
    // We need to add child views
    // So render as normal
    if (anyModelsAdded) {
      this.render();
    } else {
      // get the DOM nodes in the same order as the models
      var elsToReorder = _.map(models, function(model, index) {
        var view = children.findByModel(model);
        view._index = index;
        return view.el;
      });

      // find the views that were children before but arent in this new ordering
      var filteredOutViews = children.filter(function(view) {
        return !_.contains(elsToReorder, view.el);
      });

      this.triggerMethod('before:reorder');

      // since append moves elements that are already in the DOM,
      // appending the elements will effectively reorder them
      this._appendReorderedChildren(elsToReorder);

      // remove any views that have been filtered out
      _.each(filteredOutViews, this.removeChildView, this);
      this.checkEmpty();

      this.triggerMethod('reorder');
    }
  },

  // Render view after sorting. Override this method to
  // change how the view renders after a `sort` on the collection.
  // An example of this would be to only `renderChildren` in a `CompositeView`
  // rather than the full view.
  resortView: function() {
    if (Marionette.getOption(this, 'reorderOnSort')) {
      this.reorder();
    } else {
      this.render();
    }
  },

  // Internal method. This checks for any changes in the order of the collection.
  // If the index of any view doesn't match, it will render.
  _sortViews: function() {
    var models = this._filteredSortedModels();

    // check for any changes in sort order of views
    var orderChanged = _.find(models, function(item, index) {
      var view = this.children.findByModel(item);
      return !view || view._index !== index;
    }, this);

    if (orderChanged) {
      this.resortView();
    }
  },

  // Internal reference to what index a `emptyView` is.
  _emptyViewIndex: -1,

  // Internal method. Separated so that CompositeView can append to the childViewContainer
  // if necessary
  _appendReorderedChildren: function(children) {
    this.$el.append(children);
  },

  // Internal method. Separated so that CompositeView can have
  // more control over events being triggered, around the rendering
  // process
  _renderChildren: function() {
    this.destroyEmptyView();
    this.destroyChildren({checkEmpty: false});

    if (this.isEmpty(this.collection)) {
      this.showEmptyView();
    } else {
      this.triggerMethod('before:render:collection', this);
      this.startBuffering();
      this.showCollection();
      this.endBuffering();
      this.triggerMethod('render:collection', this);

      // If we have shown children and none have passed the filter, show the empty view
      if (this.children.isEmpty() && this.getOption('filter')) {
        this.showEmptyView();
      }
    }
  },

  // Internal method to loop through collection and show each child view.
  showCollection: function() {
    var ChildView;

    var models = this._filteredSortedModels();

    _.each(models, function(child, index) {
      ChildView = this.getChildView(child);
      this.addChild(child, ChildView, index);
    }, this);
  },

  // Allow the collection to be sorted by a custom view comparator
  _filteredSortedModels: function(addedAt) {
    var viewComparator = this.getViewComparator();
    var models = this.collection.models;
    addedAt = Math.min(Math.max(addedAt, 0), models.length - 1);

    if (viewComparator) {
      var addedModel;
      // Preserve `at` location, even for a sorted view
      if (addedAt) {
        addedModel = models[addedAt];
        models = models.slice(0, addedAt).concat(models.slice(addedAt + 1));
      }
      models = this._sortModelsBy(models, viewComparator);
      if (addedModel) {
        models.splice(addedAt, 0, addedModel);
      }
    }

    // Filter after sorting in case the filter uses the index
    if (this.getOption('filter')) {
      models = _.filter(models, function(model, index) {
        return this._shouldAddChild(model, index);
      }, this);
    }

    return models;
  },

  _sortModelsBy: function(models, comparator) {
    if (typeof comparator === 'string') {
      return _.sortBy(models, function(model) {
        return model.get(comparator);
      }, this);
    } else if (comparator.length === 1) {
      return _.sortBy(models, comparator, this);
    } else {
      return models.sort(_.bind(comparator, this));
    }
  },

  // Internal method to show an empty view in place of
  // a collection of child views, when the collection is empty
  showEmptyView: function() {
    var EmptyView = this.getEmptyView();

    if (EmptyView && !this._showingEmptyView) {
      this.triggerMethod('before:render:empty');

      this._showingEmptyView = true;
      var model = new Backbone.Model();
      this.addEmptyView(model, EmptyView);

      this.triggerMethod('render:empty');
    }
  },

  // Internal method to destroy an existing emptyView instance
  // if one exists. Called when a collection view has been
  // rendered empty, and then a child is added to the collection.
  destroyEmptyView: function() {
    if (this._showingEmptyView) {
      this.triggerMethod('before:remove:empty');

      this.destroyChildren();
      delete this._showingEmptyView;

      this.triggerMethod('remove:empty');
    }
  },

  // Retrieve the empty view class
  getEmptyView: function() {
    return this.getOption('emptyView');
  },

  // Render and show the emptyView. Similar to addChild method
  // but "add:child" events are not fired, and the event from
  // emptyView are not forwarded
  addEmptyView: function(child, EmptyView) {
    // Only trigger attach if already shown, attached, and not buffering, otherwise endBuffer() or
    // Region#show() handles this.
    var canTriggerAttach = this._isShown && !this.isBuffering && Marionette.isNodeAttached(this.el);
    var nestedViews;

    // get the emptyViewOptions, falling back to childViewOptions
    var emptyViewOptions = this.getOption('emptyViewOptions') ||
                          this.getOption('childViewOptions');

    if (_.isFunction(emptyViewOptions)) {
      emptyViewOptions = emptyViewOptions.call(this, child, this._emptyViewIndex);
    }

    // build the empty view
    var view = this.buildChildView(child, EmptyView, emptyViewOptions);

    view._parent = this;

    // Proxy emptyView events
    this.proxyChildEvents(view);

    view.once('render', function() {
      // trigger the 'before:show' event on `view` if the collection view has already been shown
      if (this._isShown) {
        Marionette.triggerMethodOn(view, 'before:show', view);
      }

      // Trigger `before:attach` following `render` to avoid adding logic and event triggers
      // to public method `renderChildView()`.
      if (canTriggerAttach && this._triggerBeforeAttach) {
        nestedViews = this._getViewAndNested(view);
        this._triggerMethodMany(nestedViews, this, 'before:attach');
      }
    }, this);

    // Store the `emptyView` like a `childView` so we can properly remove and/or close it later
    this.children.add(view);
    this.renderChildView(view, this._emptyViewIndex);

    // Trigger `attach`
    if (canTriggerAttach && this._triggerAttach) {
      nestedViews = this._getViewAndNested(view);
      this._triggerMethodMany(nestedViews, this, 'attach');
    }
    // call the 'show' method if the collection view has already been shown
    if (this._isShown) {
      Marionette.triggerMethodOn(view, 'show', view);
    }
  },

  // Retrieve the `childView` class, either from `this.options.childView`
  // or from the `childView` in the object definition. The "options"
  // takes precedence.
  // This method receives the model that will be passed to the instance
  // created from this `childView`. Overriding methods may use the child
  // to determine what `childView` class to return.
  getChildView: function(child) {
    var childView = this.getOption('childView');

    if (!childView) {
      throw new Marionette.Error({
        name: 'NoChildViewError',
        message: 'A "childView" must be specified'
      });
    }

    return childView;
  },

  // Render the child's view and add it to the
  // HTML for the collection view at a given index.
  // This will also update the indices of later views in the collection
  // in order to keep the children in sync with the collection.
  addChild: function(child, ChildView, index) {
    var childViewOptions = this.getOption('childViewOptions');
    childViewOptions = Marionette._getValue(childViewOptions, this, [child, index]);

    var view = this.buildChildView(child, ChildView, childViewOptions);

    // increment indices of views after this one
    this._updateIndices(view, true, index);

    this.triggerMethod('before:add:child', view);
    this._addChildView(view, index);
    this.triggerMethod('add:child', view);

    view._parent = this;

    return view;
  },

  // Internal method. This decrements or increments the indices of views after the
  // added/removed view to keep in sync with the collection.
  _updateIndices: function(view, increment, index) {
    if (!this.getOption('sort')) {
      return;
    }

    if (increment) {
      // assign the index to the view
      view._index = index;
    }

    // update the indexes of views after this one
    this.children.each(function(laterView) {
      if (laterView._index >= view._index) {
        laterView._index += increment ? 1 : -1;
      }
    });
  },

  // Internal Method. Add the view to children and render it at
  // the given index.
  _addChildView: function(view, index) {
    // Only trigger attach if already shown, attached, and not buffering, otherwise endBuffer() or
    // Region#show() handles this.
    var canTriggerAttach = this._isShown && !this.isBuffering && Marionette.isNodeAttached(this.el);
    var nestedViews;

    // set up the child view event forwarding
    this.proxyChildEvents(view);

    view.once('render', function() {
      // trigger the 'before:show' event on `view` if the collection view has already been shown
      if (this._isShown && !this.isBuffering) {
        Marionette.triggerMethodOn(view, 'before:show', view);
      }

      // Trigger `before:attach` following `render` to avoid adding logic and event triggers
      // to public method `renderChildView()`.
      if (canTriggerAttach && this._triggerBeforeAttach) {
        nestedViews = this._getViewAndNested(view);
        this._triggerMethodMany(nestedViews, this, 'before:attach');
      }
    }, this);

    // Store the child view itself so we can properly remove and/or destroy it later
    this.children.add(view);
    this.renderChildView(view, index);

    // Trigger `attach`
    if (canTriggerAttach && this._triggerAttach) {
      nestedViews = this._getViewAndNested(view);
      this._triggerMethodMany(nestedViews, this, 'attach');
    }
    // Trigger `show`
    if (this._isShown && !this.isBuffering) {
      Marionette.triggerMethodOn(view, 'show', view);
    }
  },

  // render the child view
  renderChildView: function(view, index) {
    if (!view.supportsRenderLifecycle) {
      Marionette.triggerMethodOn(view, 'before:render', view);
    }
    view.render();
    if (!view.supportsRenderLifecycle) {
      Marionette.triggerMethodOn(view, 'render', view);
    }
    this.attachHtml(this, view, index);
    return view;
  },

  // Build a `childView` for a model in the collection.
  buildChildView: function(child, ChildViewClass, childViewOptions) {
    var options = _.extend({model: child}, childViewOptions);
    var childView = new ChildViewClass(options);
    Marionette.MonitorDOMRefresh(childView);
    return childView;
  },

  // Remove the child view and destroy it.
  // This function also updates the indices of
  // later views in the collection in order to keep
  // the children in sync with the collection.
  removeChildView: function(view) {
    if (!view) { return view; }

    this.triggerMethod('before:remove:child', view);

    if (!view.supportsDestroyLifecycle) {
      Marionette.triggerMethodOn(view, 'before:destroy', view);
    }
    // call 'destroy' or 'remove', depending on which is found
    if (view.destroy) {
      view.destroy();
    } else {
      view.remove();
    }
    if (!view.supportsDestroyLifecycle) {
      Marionette.triggerMethodOn(view, 'destroy', view);
    }

    delete view._parent;
    this.stopListening(view);
    this.children.remove(view);
    this.triggerMethod('remove:child', view);

    // decrement the index of views after this one
    this._updateIndices(view, false);

    return view;
  },

  // check if the collection is empty
  isEmpty: function() {
    return !this.collection || this.collection.length === 0;
  },

  // If empty, show the empty view
  checkEmpty: function() {
    if (this.isEmpty(this.collection)) {
      this.showEmptyView();
    }
  },

  // You might need to override this if you've overridden attachHtml
  attachBuffer: function(collectionView, buffer) {
    collectionView.$el.append(buffer);
  },

  // Create a fragment buffer from the currently buffered children
  _createBuffer: function() {
    var elBuffer = document.createDocumentFragment();
    _.each(this._bufferedChildren, function(b) {
      elBuffer.appendChild(b.el);
    });
    return elBuffer;
  },

  // Append the HTML to the collection's `el`.
  // Override this method to do something other
  // than `.append`.
  attachHtml: function(collectionView, childView, index) {
    if (collectionView.isBuffering) {
      // buffering happens on reset events and initial renders
      // in order to reduce the number of inserts into the
      // document, which are expensive.
      collectionView._bufferedChildren.splice(index, 0, childView);
    } else {
      // If we've already rendered the main collection, append
      // the new child into the correct order if we need to. Otherwise
      // append to the end.
      if (!collectionView._insertBefore(childView, index)) {
        collectionView._insertAfter(childView);
      }
    }
  },

  // Internal method. Check whether we need to insert the view into
  // the correct position.
  _insertBefore: function(childView, index) {
    var currentView;
    var findPosition = this.getOption('sort') && (index < this.children.length - 1);
    if (findPosition) {
      // Find the view after this one
      currentView = this.children.find(function(view) {
        return view._index === index + 1;
      });
    }

    if (currentView) {
      currentView.$el.before(childView.el);
      return true;
    }

    return false;
  },

  // Internal method. Append a view to the end of the $el
  _insertAfter: function(childView) {
    this.$el.append(childView.el);
  },

  // Internal method to set up the `children` object for
  // storing all of the child views
  _initChildViewStorage: function() {
    this.children = new Backbone.ChildViewContainer();
  },

  // Handle cleanup and other destroying needs for the collection of views
  destroy: function() {
    if (this.isDestroyed) { return this; }

    this.triggerMethod('before:destroy:collection');
    this.destroyChildren({checkEmpty: false});
    this.triggerMethod('destroy:collection');

    return Marionette.View.prototype.destroy.apply(this, arguments);
  },

  // Destroy the child views that this collection view
  // is holding on to, if any
  destroyChildren: function(options) {
    var destroyOptions = options || {};
    var shouldCheckEmpty = true;
    var childViews = this.children.map(_.identity);

    if (!_.isUndefined(destroyOptions.checkEmpty)) {
      shouldCheckEmpty = destroyOptions.checkEmpty;
    }

    this.children.each(this.removeChildView, this);

    if (shouldCheckEmpty) {
      this.checkEmpty();
    }
    return childViews;
  },

  // Return true if the given child should be shown
  // Return false otherwise
  // The filter will be passed (child, index, collection)
  // Where
  //  'child' is the given model
  //  'index' is the index of that model in the collection
  //  'collection' is the collection referenced by this CollectionView
  _shouldAddChild: function(child, index) {
    var filter = this.getOption('filter');
    return !_.isFunction(filter) || filter.call(this, child, index, this.collection);
  },

  // Set up the child view event forwarding. Uses a "childview:"
  // prefix in front of all forwarded events.
  proxyChildEvents: function(view) {
    var prefix = this.getOption('childViewEventPrefix');

    // Forward all child view events through the parent,
    // prepending "childview:" to the event name
    this.listenTo(view, 'all', function() {
      var args = _.toArray(arguments);
      var rootEvent = args[0];
      var childEvents = this.normalizeMethods(_.result(this, 'childEvents'));

      args[0] = prefix + ':' + rootEvent;
      args.splice(1, 0, view);

      // call collectionView childEvent if defined
      if (typeof childEvents !== 'undefined' && _.isFunction(childEvents[rootEvent])) {
        childEvents[rootEvent].apply(this, args.slice(1));
      }

      this.triggerMethod.apply(this, args);
    });
  },

  _getImmediateChildren: function() {
    return _.values(this.children._views);
  },

  _getViewAndNested: function(view) {
    // This will not fail on Backbone.View which does not have #_getNestedViews.
    return [view].concat(_.result(view, '_getNestedViews') || []);
  },

  getViewComparator: function() {
    return this.getOption('viewComparator');
  }
});
