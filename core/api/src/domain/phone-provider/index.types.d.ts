type PhoneProviderServiceError = import("./errors").PhoneProviderServiceError
type UnknownPhoneProviderServiceError =
  import("@/domain/phone-provider").UnknownPhoneProviderServiceError
type PhoneCodeInvalidError = import("./errors").PhoneCodeInvalidError

interface IPhoneProviderVerifyService {
  getCarrier(phone: PhoneNumber): Promise<PhoneMetadata | PhoneProviderServiceError>
  validateDestination(phone: PhoneNumber): Promise<true | PhoneProviderServiceError>
  initiateVerify({
    to,
    channel,
    phoneExists,
    ip,
  }: {
    to: PhoneNumber
    channel: ChannelType
    phoneExists: boolean
    ip: IpAddress
  }): Promise<true | PhoneProviderServiceError>
  validateVerify({
    to,
    code,
  }: {
    to: PhoneNumber
    code: PhoneCode
  }): Promise<true | PhoneProviderServiceError>
}

interface IPhoneProviderTransactionalService {
  sendTemplatedSMS({
    to,
    contentSid,
    contentVariables,
  }: {
    to: PhoneNumber
    contentSid: string
    contentVariables: Record<string, string>
  }): Promise<true | PhoneProviderServiceError>
}

interface IPhoneProviderService
  extends IPhoneProviderVerifyService,
    IPhoneProviderTransactionalService {}
