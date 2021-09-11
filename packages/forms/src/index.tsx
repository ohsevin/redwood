import React, { useContext, forwardRef } from 'react'

import pascalcase from 'pascalcase'

import {
  get,
  useForm,
  FormProvider,
  useFormContext,
  RegisterOptions,
  UseFormReturn,
  UseFormProps,
} from 'react-hook-form'

import { inputTypeToDataTypeMapping, COERCION_FUNCTIONS, valueAsProps } from './coercion'

import FormError from './FormError'

// useErrorStyles
//
// Adds error-specific styling to a field.
// ------------------------

interface UseErrorStylesProps {
  name: string
  errorClassName?: string
  errorStyle?: React.CSSProperties
  className?: string
  style?: React.CSSProperties
}

const useErrorStyles = ({
  name,
  errorClassName,
  errorStyle,
  className,
  style,
}: UseErrorStylesProps): Pick<UseErrorStylesProps, 'className' | 'style'> => {
  const {
    formState: { errors },
    setError,
  } = useFormContext()

  // Check for server and RHF errors.
  const serverError = useContext(ServerErrorsContext)[name]

  React.useEffect(() => {
    if (serverError) {
      setError(name, { type: 'server', message: serverError })
    }
  }, [serverError, name, setError])

  const validationError = name ? get(errors, name) : undefined

  // Replace className/style with errorClassName/errorStyle.
  if (validationError) {
    if (errorClassName) {
      className = errorClassName
    }

    if (errorStyle) {
      style = errorStyle
    }
  }

  return { className, style }
}

// useRegister
//
// Register the field with some defaults.
// ------------------------

interface RedwoodRegisterOptions extends RegisterOptions {
  valueAsBoolean: boolean
  valueAsFloat: boolean
  valueAsJSON: boolean
  valueAsDateTime: boolean
}

const setCoercion = (validation: RedwoodRegisterOptions, { type }: { type?: string }) => {
  // Don't overwrite validation.
  if (validation.valueAsNumber || validation.valueAsDate || validation.setValueAs) {
    return
  }

  const valueAsProp = Object.keys(valueAsProps).find((valueAsProp) => valueAsProp in validation)

  if (valueAsProp) {
    validation.setValueAs = COERCION_FUNCTIONS[valueAsProps[valueAsProp]]
  } else if (type && type === 'number') {
    validation.valueAsNumber = true
  } else if (type && inputTypeToDataTypeMapping[type]) {
    validation.setValueAs = COERCION_FUNCTIONS[inputTypeToDataTypeMapping[type]]
  }
}

interface ValidatableFieldProps {
  name: string
  validation?: RegisterOptions
  onBlur?: React.FocusEventHandler<any>
  onChange?: React.ChangeEventHandler<any>
  type?: string
}

const useRegister = <T extends ValidatableFieldProps, E>(
  props: T,
  ref?: React.ForwardedRef<E>
) => {
  const { register } = useFormContext()

  // The validation prop is RHF's register's options.
  // https://react-hook-form.com/api/useform/register
  const validation = props.validation || { required: false }

  setCoercion(validation, { type: props.type })

  const {
    ref: _ref,
    onBlur: handleBlur,
    onChange: handleChange,
  } = register(props.name, validation)

  // Merge RHF's event handlers with the field's.
  const onBlur: React.FocusEventHandler<T> = (event) => {
    handleBlur(event)
    props?.onBlur?.(event)
  }

  const onChange: React.ChangeEventHandler<T> = (event) => {
    handleChange(event)
    props?.onChange?.(event)
  }

  return {
    ref: (element: E) => {
      _ref(element)

      if (typeof ref === 'function') {
        ref(element)
      } else if (ref) {
        ref.current = element
      }
    },
    onBlur,
    onChange,
  }
}

// ServerErrorsContext
//
// Context for keeping track of errors from the server.
// ------------------------

interface ServerErrorsContextProps {
  [key: string]: string
}

const ServerErrorsContext = React.createContext({} as ServerErrorsContextProps)

// Form
//
// Renders a containing <form> tag with ServerErrorContext.
// ------------------------

interface FormWithServerErrorsContext
  extends Omit<React.HTMLProps<HTMLFormElement>, 'onSubmit'> {
  error?: any
  formMethods?: UseFormReturn
  validation?: UseFormProps
  onSubmit?: (
    values: Record<string, any>,
    event?: React.BaseSyntheticEvent
  ) => void
}

const Form: React.FC<FormWithServerErrorsContext> = ({
  validation,
  error: errorProps,
  formMethods: propFormMethods,
  onSubmit,
  children,
  ...rest
}) => {
  const useFormReturn = useForm(validation)
  const formMethods = propFormMethods || useFormReturn

  return (
    <form
      {...rest}
      onSubmit={formMethods.handleSubmit((data, event) =>
        onSubmit?.(data, event)
      )}
    >
      <ServerErrorsContext.Provider
        value={
          errorProps?.graphQLErrors[0]?.extensions?.exception?.messages || {}
        }
      >
        <FormProvider {...formMethods}>{children}</FormProvider>
      </ServerErrorsContext.Provider>
    </form>
  )
}

// Label
//
// Renders a <label> tag that can be styled differently if errors are present
// on the related field(s).
// ------------------------

interface LabelProps {
  name: string
  errorClassName?: string
  errorStyle?: React.CSSProperties
}

const Label: React.FC<
  LabelProps & React.LabelHTMLAttributes<HTMLLabelElement>
> = ({
  name,
  children,
  // for useErrorStyles
  errorClassName,
  errorStyle,
  className,
  style,
  ...rest
}) => {
  const styles = useErrorStyles({
    name,
    errorClassName,
    errorStyle,
    className,
    style,
  })

  return (
    <label htmlFor={name} {...rest} {...styles}>
      {children || name}
    </label>
  )
}

// FieldError
//
// Renders a <span> with a validation error message if there is an error on this
// field.
// ------------------------

interface FieldErrorProps extends React.HTMLProps<HTMLSpanElement> {
  name: string
}

const DEFAULT_MESSAGES = {
  required: 'is required',
  pattern: 'is not formatted correctly',
  minLength: 'is too short',
  maxLength: 'is too long',
  min: 'is too low',
  max: 'is too high',
  validate: 'is not valid',
}

const FieldError = ({ name, ...rest }: FieldErrorProps) => {
  const {
    formState: { errors },
  } = useFormContext()

  const validationError = get(errors, name)

  const errorMessage =
    validationError &&
    (validationError.message ||
      `${name} ${
        DEFAULT_MESSAGES[validationError.type as keyof typeof DEFAULT_MESSAGES]
      }`)

  return validationError ? <span {...rest}>{errorMessage}</span> : null
}

// TextArea
//
// Renders a <textarea> field.
// ------------------------

const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  ValidatableFieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(
  (
    {
      name,
      id,
      // for useErrorStyles
      errorClassName,
      errorStyle,
      className,
      style,
      // for useRegister
      validation,
      onBlur,
      onChange,
      ...rest
    },
    ref
  ) => {
    const styles = useErrorStyles({
      name,
      errorClassName,
      errorStyle,
      className,
      style,
    })

    const useRegisterReturn = useRegister(
      {
        name,
        validation,
        onBlur,
        onChange,
      },
      ref
    )

    return (
      <textarea id={id || name} {...rest} {...styles} {...useRegisterReturn} />
    )
  }
)

// Select
//
// Renders a <select> field.
// ------------------------

const SelectField = forwardRef<
  HTMLSelectElement,
  ValidatableFieldProps & React.SelectHTMLAttributes<HTMLSelectElement>
>(
  (
    {
      name,
      id,
      // for useErrorStyles
      errorClassName,
      errorStyle,
      className,
      style,
      // for useRegister
      validation,
      onBlur,
      onChange,
      ...rest
    },
    ref
  ) => {
    const styles = useErrorStyles({
      name,
      errorClassName,
      errorStyle,
      className,
      style,
    })

    const useRegisterReturn = useRegister(
      {
        name,
        validation,
        onBlur,
        onChange,
      },
      ref
    )

    return (
      <select id={id || name} {...rest} {...styles} {...useRegisterReturn} />
    )
  }
)

// Checkbox
//
// Renders a <input type="checkbox"> field.
// ------------------------

interface CheckboxFieldProps
  extends Omit<ValidatableFieldProps, 'defaultValue'> {
  defaultChecked?: boolean
}

export const CheckboxField = forwardRef<
  HTMLInputElement,
  CheckboxFieldProps & React.InputHTMLAttributes<HTMLInputElement>
>(
  (
    {
      name,
      id,
      // for useErrorStyles
      errorClassName,
      errorStyle,
      className,
      style,
      // for useRegister
      validation,
      onBlur,
      onChange,
      ...rest
    },
    ref
  ) => {
    const styles = useErrorStyles({
      name,
      errorClassName,
      errorStyle,
      className,
      style,
    })

    const type = 'checkbox'

    const useRegisterReturn = useRegister(
      {
        name,
        validation,
        onBlur,
        onChange,
        type,
      },
      ref
    )

    return (
      <input
        id={id || name}
        {...rest}
        // This order ensures type="checkbox"
        type={type}
        {...styles}
        {...useRegisterReturn}
      />
    )
  }
)

// Submit button
//
// Renders a <button type="submit">.
// ------------------------

const Submit = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'>
>((props, ref) => <button ref={ref} type="submit" {...props} />)

// Input
//
// Renders an <input>.
// ------------------------

type InputType = typeof INPUT_TYPES[number]

interface InputFieldProps extends ValidatableFieldProps {
  type?: InputType
}

const InputField = forwardRef<
  HTMLInputElement,
  InputFieldProps & React.InputHTMLAttributes<HTMLInputElement>
>(
  (
    {
      name,
      id,
      type
      // for useErrorStyles
      errorClassName,
      errorStyle,
      className,
      style,
      // for useRegister
      validation,
      onBlur,
      onChange,
      ...rest
    },
    ref
  ) => {
    const styles = useErrorStyles({
      name,
      errorClassName,
      errorStyle,
      className,
      style,
    })

    const useRegisterReturn = useRegister(
      {
        name,
        validation,
        onBlur,
        onChange,
        type,
      },
      ref
    )

    return (
      <input id={id || name} {...rest} type={type} {...styles} {...useRegisterReturn} />
    )
  }
)

// Create a component for each type of Input.
//
// Uses a bit of Javascript metaprogramming to create the functions with a dynamic
// name rather than having to write out each and every component definition. In
// simple terms it creates an object with the key being the current value of `type`
// and then immediately returns the value, which is the component function definition.
//
// In the end we end up with `inputComponents.TextField` and all the others. Export those
// and we're good to go.

const INPUT_TYPES = [
  'button',
  'color',
  'date',
  'datetime-local',
  'email',
  'file',
  'hidden',
  'image',
  'month',
  'number',
  'password',
  'radio',
  'range',
  'reset',
  'search',
  'submit',
  'tel',
  'text',
  'time',
  'url',
  'week',
] as const

const inputComponents: Record<
  string,
  React.ForwardRefExoticComponent<
    InputFieldProps &
      React.InputHTMLAttributes<HTMLInputElement> &
      React.RefAttributes<HTMLInputElement>
  >
> = {}

INPUT_TYPES.forEach((type) => {
  inputComponents[`${pascalcase(type)}Field`] = forwardRef<
    HTMLInputElement,
    InputFieldProps & React.InputHTMLAttributes<HTMLInputElement>
  >((props, ref) => <InputField ref={ref} type={type} {...props} />)
})

export const {
  ButtonField,
  ColorField,
  DateField,
  DatetimeLocalField,
  EmailField,
  FileField,
  HiddenField,
  ImageField,
  MonthField,
  NumberField,
  PasswordField,
  RadioField,
  RangeField,
  ResetField,
  SearchField,
  SubmitField,
  TelField,
  TextField,
  TimeField,
  UrlField,
  WeekField,
} = inputComponents

export {
  Form,
  ServerErrorsContext,
  FormError,
  FieldError,
  InputField,
  Label,
  TextAreaField,
  SelectField,
  Submit,
}
