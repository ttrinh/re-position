import * as React from 'react';
import { Subject } from 'rxjs';

import { takeUntil } from 'rxjs/operators';
import {
    createAllMoveObservable,
    createDndObservable,
    createKeyboardMoveObservable,
    createResizeObservable,
    createRotateObservable,
} from './observables';
import { Position } from './types';
import {
    calculateResizeObservableConfigs,
    calculateRotateObservableConfigs,
    isFunction,
    objectsAreEqual,
    randomString,
} from './utils/misc';

type PositionableState = Position;

export interface PositionableProps {
    /**
     * Should all functionality be disabled? This property takes
     * precedence over `movable`, `resizable`, and `rotatable`.
     */
    disabled?: boolean;

    /**
     * By default, if `movable` is `true`, both mouse and keyboard movement
     * are enabled. This prop allows keyboard-based movement to be disabled.
     */
    disableKeyboardMovement?: boolean;

    /**
     * Members of the same group will respond
     * to each other's drag and drop events.
     */
    group?: string;

    /** Should moving be enabled? */
    movable?: boolean;

    /** Callback to notify when Positioning has changed */
    onUpdate?: (sizing: Position) => void;

    /** Current Positioning (left, top, width, height, rotation) */
    position: Position;

    /** Render Prop alternative to using `children` */
    render?: RenderCallback;

    /** Snap drag and resize to pixels of this interval. */
    snapTo?: number;

    /** Should resizing be enabled? */
    resizable?: boolean;

    /** Should rotation be enabled? */
    rotatable?: boolean;
}

type RenderCallback = (args: RenderCallbackArgs) => JSX.Element;

export interface RenderCallbackArgs {
    renderedPosition: Position;
    refHandlers: Positionable['refHandlers'];
}

export class Positionable extends React.Component<
    PositionableProps,
    PositionableState
> {
    public static defaultProps = {
        resizable: [],
    };

    public readonly state: PositionableState;

    private refHandlers = {
        container: React.createRef<HTMLElement>(),

        dnd: React.createRef<HTMLElement>(),

        neRotate: React.createRef<HTMLElement>(),
        seRotate: React.createRef<HTMLElement>(),
        swRotate: React.createRef<HTMLElement>(),
        nwRotate: React.createRef<HTMLElement>(),

        nResize: React.createRef<HTMLElement>(),
        neResize: React.createRef<HTMLElement>(),
        eResize: React.createRef<HTMLElement>(),
        seResize: React.createRef<HTMLElement>(),
        sResize: React.createRef<HTMLElement>(),
        swResize: React.createRef<HTMLElement>(),
        wResize: React.createRef<HTMLElement>(),
        nwResize: React.createRef<HTMLElement>(),
    };

    private destroy$ = new Subject<void>();

    constructor(props: PositionableProps) {
        super(props);
        this.state = { ...props.position };
    }

    public componentDidMount() {
        this.buildSubscriptions();
    }

    public componentWillUnmount() {
        this.destroy$.next();
    }

    /**
     * Update subscriptions and internal Position if the props change.
     */
    public componentDidUpdate(prevProps: PositionableProps) {
        if (objectsAreEqual(this.props, prevProps)) {
            return;
        }

        const { position, ...rest } = this.props;
        const { position: prevPosition, ...prevRest } = prevProps;

        if (!objectsAreEqual(position, prevPosition)) {
            this.setState(this.props.position);
        }

        if (!objectsAreEqual(rest, prevRest)) {
            this.buildSubscriptions();
        }
    }

    public render() {
        const { children, render } = this.props;

        const passedProps: RenderCallbackArgs = {
            renderedPosition: this.state,
            refHandlers: this.refHandlers,
        };

        if (isFunction(render)) {
            return render(passedProps);
        }

        if (isFunction(children)) {
            return children(passedProps);
        }

        throw new Error(
            'Positionable must receive `render` or `children` as render callback'
        );
    }

    /**
     * Call `onUpdate()` prop if position has changed.
     */
    private handleUpdate = () => {
        if (
            !this.props.onUpdate ||
            objectsAreEqual(this.state, this.props.position)
        ) {
            return;
        }

        this.props.onUpdate(this.state);
    };

    /**
     * Handle subscribing to and unsubscribing from Observables.
     */
    private buildSubscriptions() {
        const {
            disabled,
            disableKeyboardMovement,
            movable,
            resizable,
            rotatable,
            snapTo,
        } = this.props;
        const { left, width } = this.state;
        const group = this.props.group || randomString();

        this.destroy$.next();

        if (disabled) {
            return;
        }

        if (!this.refHandlers.container.current) {
            return;
        }

        if (movable) {
            createDndObservable({
                element: this.refHandlers.container.current,
                group,
                handle:
                    this.refHandlers.dnd.current ||
                    this.refHandlers.container.current,
                snapTo,
            })
                .pipe(takeUntil(this.destroy$))
                .subscribe();

            createAllMoveObservable({
                element: this.refHandlers.container.current,
                group,
                onComplete: this.handleUpdate,
                shouldConvertToPercent: left.includes('%'),
            })
                .pipe(takeUntil(this.destroy$))
                .subscribe(newCoords => this.setState(newCoords));

            if (!disableKeyboardMovement) {
                createKeyboardMoveObservable({
                    element: this.refHandlers.container.current,
                    onComplete: this.handleUpdate,
                    shouldConvertToPercent: left.includes('%'),
                })
                    .pipe(takeUntil(this.destroy$))
                    .subscribe(newCoords => this.setState(newCoords));
            }
        }

        if (resizable) {
            const resizeObservableConfigs = calculateResizeObservableConfigs();

            resizeObservableConfigs.forEach(config => {
                const handle = this.refHandlers[config.refHandlerName].current;

                if (!handle) {
                    return;
                }

                createResizeObservable({
                    element: this.refHandlers.container.current!,
                    handle,
                    onComplete: this.handleUpdate,
                    top: config.top,
                    right: config.right,
                    bottom: config.bottom,
                    left: config.left,
                    shouldConvertToPercent: width.includes('%'),
                    snapTo,
                })
                    .pipe(takeUntil(this.destroy$))
                    .subscribe(newPosition => this.setState(newPosition));
            });
        }

        if (rotatable) {
            const rotateObservableConfigs = calculateRotateObservableConfigs();

            rotateObservableConfigs.forEach(config => {
                const handle = this.refHandlers[config.refHandlerName].current;

                if (!handle) {
                    return;
                }

                createRotateObservable({
                    element: this.refHandlers.container.current!,
                    handle,
                    onComplete: this.handleUpdate,
                })
                    .pipe(takeUntil(this.destroy$))
                    .subscribe(newRotation => this.setState(newRotation));
            });
        }
    }
}

export default Positionable;
