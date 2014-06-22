/*global Igloo State */

/**
 * Shortest past solver that runs on the GPU using cellular automata.
 * @param {number} w width
 * @param {number} h height
 * @param {Uint8Array} maze
 * @param {HTMLCanvasElement} canvas to access WebGL and draw progress
 */
function GpuSolver(w, h, maze, canvas) {
    this.statesize = new Float32Array([w, h]);
    this.viewsize = new Float32Array([canvas.width, canvas.height]);
    var igloo = this.igloo = new Igloo(canvas);
    if (igloo == null) {
        alert('Could not initialize WebGL!');
        throw new Error('No WebGL');
    }
    var gl = igloo.gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    this.programs = {
        step: igloo.program('glsl/quad.vert', 'glsl/12state.frag'),
        draw: igloo.program('glsl/quad.vert', 'glsl/12draw.frag')
    };
    this.buffers = {
        quad: igloo.array(Igloo.QUAD2)
    };
    this.textures = {
        fore: igloo.texture(null, null, null, gl.NEAREST).blank(w, h),
        back: igloo.texture(null, null, null, gl.NEAREST).blank(w, h)
    };
    this.framebuffers = {
        step: igloo.framebuffer()
    };
    this.set(maze);
    this.done = false;
    this.age = 0;
}

/**
 * Swap the foreground and background states.
 * @returns {GpuSolver} this
 */
GpuSolver.prototype.swap = function() {
    var tmp = this.textures.fore;
    this.textures.fore = this.textures.back;
    this.textures.back = tmp;
    return this;
};

/**
 * Set a new maze to solve, resetting the solver.
 * @param {Uint8Array} maze
 * @returns {GpuSolver} this
 */
GpuSolver.prototype.set = function(maze) {
    var w = this.statesize[0], h = this.statesize[1],
        rgba = new Uint8Array(w * h * 4);
    for (var i = 0; i < maze.length; i++) {
        rgba[i * 4 + 0] = maze[i] * 255 / 11;
        rgba[i * 4 + 1] = 0;
        rgba[i * 4 + 2] = 0;
        rgba[i * 4 + 3] = 0;
    }
    rgba[0]               = State.BEGIN * 255 / 11;
    rgba[rgba.length - 4] = State.END   * 255 / 11;
    this.textures.fore.subset(rgba, 0, 0, w, h);
    this.done = false;
    return this;
};

/**
 * Take one or more steps towards the solution.
 * @param {number} [n] the number of steps to take
 * @returns {GpuSolver} this
 */
GpuSolver.prototype.step = function(n) {
    n = n || 1;
    var gl = this.igloo.gl;
    gl.viewport(0, 0, this.statesize[0], this.statesize[1]);
    var step = this.programs.step.use()
        .attrib('quad', this.buffers.quad, 2)
        .uniform('scale', this.statesize)
        .uniformi('maze', 0);
    var rgba = new Uint8Array(4);
    while (n-- > 0 && !this.done) {
        this.age++;
        this.framebuffers.step.attach(this.textures.back);
        this.textures.fore.bind(0);
        step.draw(gl.TRIANGLE_STRIP, Igloo.QUAD2.length / 2);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        /* Test if START changed into a ROUTE. */
        if (State.isRoute(Math.round(rgba[0] * 11 / 255))) {
            this.done = true;
        }
        this.swap();
    }
    return this;
};

/**
 * Draw the current solution state to the canvas.
 * @returns {GpuSolver} this
 */
GpuSolver.prototype.draw = function() {
    var gl = this.igloo.gl;
    this.igloo.defaultFramebuffer.bind();
    this.textures.fore.bind(0);
    gl.viewport(0, 0, this.viewsize[0], this.viewsize[1]);
    this.programs.draw.use()
        .attrib('quad', this.buffers.quad, 2)
        .uniform('scale', this.viewsize)
        .uniformi('maze', 0)
        .draw(gl.TRIANGLE_STRIP, Igloo.QUAD2.length / 2);
    return this;
};

/**
 * Animate the solution using requestAnimationFrame.
 * @param {Function} [callback]
 */
GpuSolver.prototype.animate = function(callback) {
    var _this = this;
    window.requestAnimationFrame(function() {
        if (!_this.done) {
            _this.step(2).draw();
            _this.animate(callback);
        } else {
            if (callback != null) callback();
        }
    });
    return this;
};