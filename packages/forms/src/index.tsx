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

import {
  CoercionContextProvider,
  TDefinedCoercionFunctions,
  useCoercion,
} from './coercion'
import FormError from './FormError'

// Adds error-specific styling to a field.
// ------------------------

interface UseErrorStylesProps {
  name: string
  errorClassName?: string
  errorStyle?: React.CSSProperties
  className?: string
  style?: React.CSSProperties
}

const useErrorStyles = (
  props: UseErrorStylesProps
): Pick<UseErrorStylesProps, 'className' | 'style'> => {
  const {
    formState: { errors },
    setError,
  } = useFormContext()

  // Check for server and RHF errors.
  const serverError = useContext(ServerErrorsContext)[props.name]

  React.useEffect(() => {
    if (serverError) {
      setError(props.name, { type: 'server', message: serverError })
    }
  }, [serverError, props.name, setError])

  const validationError = props.name ? get(errors, props.name) : undefined

  // Replace className/style with errorClassName/errorStyle.
  const { errorClassName, errorStyle } = props
  let { className, style } = props

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

// Register the field with some defaults.
// ------------------------

interface ValidatableFieldProps {
  name: string
  validation?: RegisterOptions
  transformValue?: ((value: string) => any) | TDefinedCoercionFunctions
  onBlur?: React.FocusEventHandler<any>
  onChange?: React.ChangeEventHandler<any>
}

const jsonValidation = (value: string) => {
  try {
    JSON.parse(value)
  } catch (e) {
    return e.message
  }
}

const useRegister = <T extends ValidatableFieldProps, E>(
  props: T,
  ref?: React.ForwardedRef<E>
) => {
  const { register } = useFormContext()

  // The validation prop is RHF's register's options.
  // https://react-hook-form.com/api/useform/register
  const validation = props.validation || { required: false }

  // Primarily for TextAreaField.
  if (!validation.validate && props.transformValue === 'Json') {
    validation.validate = jsonValidation
  }

  const {
    ref: _ref,
    onBlur: handleBlur,
    onChange: handleChange,
    ...rest
  } = register(props.name, validation)

  // Merge RHF"s event handlers with the field's.
  const onBlur: React.FocusEventHandler<T> = (event) => {
    handleBlur(event)
    props?.onBlur?.(event)
  }

  const onChange: React.ChangeEventHandler<T> = (event) => {
    handleChange(event)
    props?.onChange?.(event)
  }

  return {
    ...rest,
    onBlur,
    onChange,
    ref: (element: E) => {
      _ref(element)

      if (typeof ref === 'function') {
        ref(element)
      } else if (ref) {
        ref.current = element
      }
    },
  }
}

// Context for keeping track of errors from the server.
// ------------------------

interface ServerErrorsContextProps {
  [key: string]: string
}
const ServerErrorsContext = React.createContext({} as ServerErrorsContextProps)

const coerceValues = (
  data: Record<string, string>,
  coerce: (name: string, value: string) => any
) => {
  const coercedData: Record<string, any> = {}

  Object.keys(data).forEach((name) => {
    coercedData[name] = coerce(name, data[name])
  })

  return coercedData
}

// Renders a containing <form> tag with the required contexts.
// ------------------------

interface FormWithCoercionContext
  extends Omit<React.HTMLProps<HTMLFormElement>, 'onSubmit'> {
  error?: any
  formMethods?: UseFormReturn
  validation?: UseFormProps
  onSubmit?: (
    values: Record<string, any>,
    event?: React.BaseSyntheticEvent
  ) => void
}

const FormWithCoercionContext: React.FC<FormWithCoercionContext> = (props) => {
  // Deconstruct some props we care about and keep the remaining `formProps` to pass to the <form> tag.
  const {
    error: errorProps,
    formMethods: propFormMethods,
    onSubmit,
    ...formProps
  } = props
  const useFormReturn = useForm(props.validation)
  const formMethods = propFormMethods || useFormReturn
  const { coerce } = useCoercion()

  return (
    <form
      {...formProps}
      onSubmit={formMethods.handleSubmit((data, event) =>
        onSubmit?.(coerceValues(data, coerce), event)
      )}
    >
      <ServerErrorsContext.Provider
        value={
          errorProps?.graphQLErrors[0]?.extensions?.exception?.messages || {}
        }
      >
        <FormProvider {...formMethods}>{props.children}</FormProvider>
      </ServerErrorsContext.Provider>
    </form>
  )
}

const Form: React.FC<FormWithCoercionContext> = (props) => {
  return (
    <CoercionContextProvider>
      <FormWithCoercionContext {...props} />
    </CoercionContextProvider>
  )
}

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
> = (props) => {
  const styles = useErrorStyles(props)

  const { name, children, ...rest } = props

  return (
    <label htmlFor={name} {...rest} {...styles}>
      {children || name}
    </label>
  )
}

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

// Renders a <textarea> field.
// ------------------------

const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  ValidatableFieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>
>((props, ref) => {
  const styles = useErrorStyles(props)
  const fieldProps = useRegister(props, ref)
  const { setCoercion } = useCoercion()

  React.useEffect(() => {
    setCoercion({
      name: props.name,
      transformValue: props.transformValue,
    })
  }, [setCoercion, props.name, props.transformValue])

  const {
    id,
    name,
    validation: _validation,
    transformValue: _transformValue,
    ...rest
  } = props

  return <textarea id={id || name} {...rest} {...styles} {...fieldProps} />
})

// Renders a <select> field.
// ------------------------

const SelectField = forwardRef<
  HTMLSelectElement,
  ValidatableFieldProps & React.SelectHTMLAttributes<HTMLSelectElement>
>((props, ref) => {
  const styles = useErrorStyles(props)
  const fieldProps = useRegister(props, ref)
  const { setCoercion } = useCoercion()

  React.useEffect(() => {
    setCoercion({
      name: props.name,
      transformValue: props.transformValue,
    })
  }, [setCoercion, props.name, props.transformValue])

  const {
    name,
    id,
    validation: _validation,
    transformValue: _transformValue,
    ...rest
  } = props

  return <select id={id || name} {...rest} {...styles} {...fieldProps} />
})

// Renders a <input type="checkbox"> field.
// ------------------------

interface CheckboxFieldProps
  extends Omit<ValidatableFieldProps, 'defaultValue'> {
  defaultChecked?: boolean
}

export const CheckboxField = forwardRef<
  HTMLInputElement,
  CheckboxFieldProps & React.InputHTMLAttributes<HTMLInputElement>
>((props, ref) => {
  const styles = useErrorStyles(props)
  const fieldProps = useRegister(props, ref)
  const { setCoercion } = useCoercion()
  const type = 'checkbox'

  React.useEffect(() => {
    setCoercion({
      name: props.name,
      type,
      transformValue: props.transformValue,
    })
  }, [setCoercion, props.name, type, props.transformValue])

  const {
    id,
    name,
    validation: _validation,
    transformValue: _transformValue,
    ...rest
  } = props

  return (
    <input type={type} id={id || name} {...rest} {...styles} {...fieldProps} />
  )
})

// Renders a <button type="submit">.
// ------------------------

const Submit = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'>
>((props, ref) => <button ref={ref} type="submit" {...props} />)

// Renders an <input>.
// ------------------------

type InputType = typeof INPUT_TYPES[number]

interface InputFieldProps extends ValidatableFieldProps {
  type?: InputType
}

const InputField = forwardRef<
  HTMLInputElement,
  InputFieldProps & React.InputHTMLAttributes<HTMLInputElement>
>((props, ref) => {
  const styles = useErrorStyles(props)
  const fieldProps = useRegister(props, ref)
  const { setCoercion } = useCoercion()

  React.useEffect(() => {
    setCoercion({
      name: props.name,
      type: props.type,
      transformValue: props.transformValue,
    })
  }, [setCoercion, props.name, props.type, props.transformValue])

  const {
    id,
    name,
    validation: _validation,
    transformValue: _transformValue,
    ...rest
  } = props

  return <input id={id || name} {...rest} {...styles} {...fieldProps} />
})

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
