import { ValidationError } from "@/domain/shared"
import { CouldNotFindError, RepositoryError } from "@/domain/errors"

export class InvalidContactIdError extends ValidationError {}
export class InvalidHandleError extends ValidationError {}
export class InvalidDisplayNameError extends ValidationError {}

export class CouldNotFindContactFromAccountIdError extends CouldNotFindError {}
export class CouldNotFindContactFromContactIdError extends CouldNotFindError {}

export class CouldNotUpdateContactError extends RepositoryError {}
