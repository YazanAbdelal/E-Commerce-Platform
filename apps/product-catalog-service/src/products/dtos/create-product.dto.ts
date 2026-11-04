import { CreateProductRequest } from '@app/contracts'
import { IsNumber, IsString, Min, MinLength } from 'class-validator'

export class CreateProductDto implements CreateProductRequest {
    @IsString()
    @MinLength(1)
    name: string;

    @IsNumber()
    @Min(0)
    price: number;
}