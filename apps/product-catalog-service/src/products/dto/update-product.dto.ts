import { UpdateProductRequest } from "@app/contracts";
import { CreateProductDto } from "./create-product.dto.js";
import { PartialType } from "@nestjs/mapped-types";

export class UpdateProductDto extends PartialType(CreateProductDto) { }